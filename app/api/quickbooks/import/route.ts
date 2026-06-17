// app/api/quickbooks/import/route.ts
// Imports income data from QuickBooks Online using the Profit & Loss report
// QuickBooks' P&L report by month gives us exactly what we need without
// reconstructing the P&L from raw transactions (which Xero required)

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { type VatClassification } from "@/lib/hmrc-vat-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthLabel(date: Date): string {
  return date.toLocaleString("en-GB", { month: "short", year: "numeric" });
}

function getLast12MonthsWindow(): { fromDate: Date; toDate: Date } {
  const today = new Date();
  const endMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const fromDate = new Date(endMonth.getFullYear(), endMonth.getMonth() - 11, 1);
  const toDate = new Date(endMonth.getFullYear(), endMonth.getMonth() + 1, 0);
  return { fromDate, toDate };
}

async function refreshQuickBooksToken(refreshToken: string) {
  const qbClientId = process.env.QUICKBOOKS_CLIENT_ID!;
  const qbClientSecret = process.env.QUICKBOOKS_CLIENT_SECRET!;

  const response = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${qbClientId}:${qbClientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

// QuickBooks sandbox uses a different base URL to production
function getQuickBooksBaseUrl(): string {
  const env = process.env.QUICKBOOKS_ENV || "sandbox";
  return env === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId");

    if (!clientId) {
      return NextResponse.json({ ok: false, error: "Missing clientId" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: client } = await supabase
      .from("clients")
      .select("id,name")
      .eq("id", clientId)
      .single();

    if (!client) {
      return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });
    }

    const { data: connection, error: connError } = await supabase
      .from("accounting_connections")
      .select("*")
      .eq("client_id", clientId)
      .eq("provider", "quickbooks")
      .order("connected_at", { ascending: false })
      .limit(1)
      .single();

    if (connError || !connection) {
      return NextResponse.json(
        { ok: false, error: "No QuickBooks connection found for this client" },
        { status: 404 }
      );
    }

    let accessToken = connection.access_token;
    let refreshToken = connection.refresh_token;

    // Refresh token if expired or expiring soon
    const expiresAt = new Date(connection.token_expires_at).getTime();
    if (Date.now() > expiresAt - 60_000) {
      const refreshed = await refreshQuickBooksToken(refreshToken);
      accessToken = refreshed.access_token;
      refreshToken = refreshed.refresh_token;

      await supabase
        .from("accounting_connections")
        .update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        })
        .eq("id", connection.id);
    }

    const realmId = connection.provider_tenant_id;
    const baseUrl = getQuickBooksBaseUrl();

    async function qbGet(path: string) {
      const res = await fetch(`${baseUrl}${path}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) throw new Error(`QuickBooks API error: ${res.status} ${await res.text()}`);
      return res.json();
    }

    const { fromDate, toDate } = getLast12MonthsWindow();

    // Get account mappings for this client (same approach as Xero)
    const { data: mappings } = await supabase
      .from("account_mappings")
      .select("xero_account_code,vat_classification,reviewed")
      .eq("client_id", clientId);

    const accountMap = new Map<string, VatClassification>();
    for (const m of mappings || []) {
      if (m.reviewed) {
        accountMap.set(m.xero_account_code, m.vat_classification as VatClassification);
      }
    }

    if (accountMap.size === 0) {
      return NextResponse.json({
        ok: false,
        error: "No confirmed account mappings found. Please set up account mappings first.",
        needsMapping: true,
      });
    }

    // Use QuickBooks ProfitAndLoss report, summarized by month
    // This report already correctly nets invoices, payments, credit notes and journals
    const reportRes = await qbGet(
      `/v3/company/${realmId}/reports/ProfitAndLoss` +
        `?start_date=${isoDate(fromDate)}&end_date=${isoDate(toDate)}` +
        `&summarize_column_by=Month&minorversion=65`
    );

    const importedLines: Array<{
      client_id: string;
      source: string;
      source_record_id: string;
      source_line_key: string;
      transaction_date: string;
      account_code: string;
      account_name: string | null;
      description: string | null;
      tax_type: string | null;
      vat_classification: string;
      amount: number;
      updated_at: string;
    }> = [];

    const columns = reportRes?.Columns?.Column || [];
    const monthColumns = columns
      .map((col: any, index: number) => ({ index, startDate: col.MetaData?.find((m: any) => m.Name === "StartDate")?.Value }))
      .filter((c: any) => c.startDate);

    function walkRows(rows: any[], totalLinesImported: { count: number }, totalLinesSkipped: { count: number }) {
      for (const row of rows || []) {
        if (row.type === "Data" && row.ColData) {
          const accountName = row.ColData[0]?.value || "";
          const accountId = row.ColData[0]?.id || accountName;
          const classification = accountMap.get(accountId) || accountMap.get(accountName);

          if (!classification || classification === ("excluded" as VatClassification)) {
            totalLinesSkipped.count++;
            continue;
          }

          for (const monthCol of monthColumns) {
            const cellValue = row.ColData[monthCol.index]?.value;
            const amount = Number(cellValue || 0);
            if (amount === 0) continue;

            const monthDate = new Date(monthCol.startDate);

            importedLines.push({
              client_id: clientId as string,
              source: "quickbooks",
              source_record_id: accountId,
              source_line_key: `qb_pnl_${accountId}_${monthCol.startDate}`,
              transaction_date: isoDate(monthDate),
              account_code: accountId,
              account_name: accountName,
              description: `QuickBooks P&L — ${accountName}`,
              tax_type: null,
              vat_classification: classification,
              amount: Number(amount.toFixed(2)),
              updated_at: new Date().toISOString(),
            });
            totalLinesImported.count++;
          }
        }
        if (row.Rows?.Row) {
          walkRows(row.Rows.Row, totalLinesImported, totalLinesSkipped);
        }
      }
    }

    const totalLinesImported = { count: 0 };
    const totalLinesSkipped = { count: 0 };
    walkRows(reportRes?.Rows?.Row || [], totalLinesImported, totalLinesSkipped);

    if (importedLines.length === 0) {
      return NextResponse.json({
        ok: false,
        error: "No income data found in QuickBooks for the last 12 months. Check account mappings are confirmed.",
        debug: {
          dateRangeRequested: { from: isoDate(fromDate), to: isoDate(toDate) },
          accountMapKeys: Array.from(accountMap.keys()),
          monthColumnsFound: monthColumns.length,
          rawRowCount: (reportRes?.Rows?.Row || []).length,
          rawReportSample: JSON.stringify(reportRes).slice(0, 3000),
        },
      });
    }

    // Clear existing QuickBooks imported lines for this client and date range
    await supabase
      .from("xero_imported_lines")
      .delete()
      .eq("client_id", clientId)
      .eq("source", "quickbooks");

    // Insert new lines in batches
    const batchSize = 200;
    for (let i = 0; i < importedLines.length; i += batchSize) {
      const batch = importedLines.slice(i, i + batchSize);
      await supabase.from("xero_imported_lines").insert(batch);
    }

    // Aggregate into monthly turnover entries
    const monthlyTotals = new Map<string, { standard: number; reduced: number; zero: number; exempt: number; out: number }>();

    for (const line of importedLines) {
      const date = new Date(line.transaction_date);
      const label = monthLabel(date);
      if (!monthlyTotals.has(label)) {
        monthlyTotals.set(label, { standard: 0, reduced: 0, zero: 0, exempt: 0, out: 0 });
      }
      const bucket = monthlyTotals.get(label)!;
      const classification = line.vat_classification;
      if (classification === "standard_rated") bucket.standard += line.amount;
      else if (classification === "reduced_rated") bucket.reduced += line.amount;
      else if (classification === "zero_rated") bucket.zero += line.amount;
      else if (classification === "exempt") bucket.exempt += line.amount;
      else if (classification === "out_of_scope") bucket.out += line.amount;
    }

    await supabase
      .from("turnover_entries")
      .delete()
      .eq("client_id", clientId)
      .eq("source", "quickbooks");

    const turnoverEntries = Array.from(monthlyTotals.entries()).map(([label, totals]) => ({
      client_id: clientId as string,
      month_label: label,
      standard_rated: Number(totals.standard.toFixed(2)),
      reduced_rated: Number(totals.reduced.toFixed(2)),
      zero_rated: Number(totals.zero.toFixed(2)),
      exempt: Number(totals.exempt.toFixed(2)),
      out_of_scope: Number(totals.out.toFixed(2)),
      source: "quickbooks",
    }));

    await supabase.from("turnover_entries").upsert(turnoverEntries, { onConflict: "client_id,month_label,source" });

    const rollingTurnover = turnoverEntries.reduce((sum, e) => sum + e.standard_rated + e.reduced_rated + e.zero_rated, 0);
    const VAT_THRESHOLD = 90000;
    const riskStatus =
      rollingTurnover >= VAT_THRESHOLD ? "Registration Required"
      : rollingTurnover >= VAT_THRESHOLD * 0.9 ? "High Risk"
      : rollingTurnover >= VAT_THRESHOLD * 0.8 ? "Warning"
      : rollingTurnover >= VAT_THRESHOLD * 0.7 ? "Watch"
      : "Low Risk";

    await supabase.from("vat_reviews").insert({
      client_id: clientId as string,
      rolling_taxable_turnover: Number(rollingTurnover.toFixed(2)),
      expected_next_30_days: 0,
      risk_status: riskStatus,
    });

    return NextResponse.json({
      ok: true,
      clientName: client.name,
      source: "quickbooks",
      linesImported: totalLinesImported.count,
      linesSkipped: totalLinesSkipped.count,
      rollingTurnover: Number(rollingTurnover.toFixed(2)),
      riskStatus,
      monthsFound: turnoverEntries.length,
    });

  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
