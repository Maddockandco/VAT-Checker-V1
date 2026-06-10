// app/api/xero/import/route.ts
// Imports transactions from Xero using confirmed account mappings
// Handles invoices, bank transactions AND manual journals

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isTaxableTurnover, type VatClassification } from "@/lib/hmrc-vat-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseXeroDate(value: string | undefined): Date | null {
  if (!value) return null;
  const match = value.match(/\/Date\((\d+)/);
  if (match?.[1]) return new Date(Number(match[1]));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
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

async function refreshXeroToken(refreshToken: string) {
  const response = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(
          `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
        ).toString("base64"),
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

    // Check client exists
    const { data: client } = await supabase
      .from("clients")
      .select("id,name")
      .eq("id", clientId)
      .single();

    if (!client) {
      return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });
    }

    // Get Xero connection
    const { data: connection, error: connError } = await supabase
      .from("accounting_connections")
      .select("*")
      .eq("client_id", clientId)
      .eq("provider", "xero")
      .order("connected_at", { ascending: false })
      .limit(1)
      .single();

    if (connError || !connection) {
      return NextResponse.json(
        { ok: false, error: "No Xero connection found. Please connect Xero first." },
        { status: 404 }
      );
    }

    // Get account mappings — only use reviewed/confirmed ones
    const { data: mappings } = await supabase
      .from("account_mappings")
      .select("xero_account_code,vat_classification,reviewed")
      .eq("client_id", clientId);

    const accountMap = new Map<string, VatClassification>();
    let unreviewedCount = 0;

    for (const mapping of mappings || []) {
      if (mapping.vat_classification === "needs_review") {
        unreviewedCount += 1;
        continue;
      }
      accountMap.set(
        String(mapping.xero_account_code).trim(),
        mapping.vat_classification as VatClassification
      );
    }

    // Warn but don't block — unreviewed accounts just won't be imported
    const warnings: string[] = [];
    if (unreviewedCount > 0) {
      warnings.push(
        `${unreviewedCount} account(s) are awaiting your review and have been excluded from this import. Go to Account Mappings to review them.`
      );
    }

    if (accountMap.size === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "No confirmed account mappings found.",
          message:
            "Please go to Account Mappings and review your Xero income accounts before importing.",
        },
        { status: 400 }
      );
    }

    let accessToken = connection.access_token;
    let refreshToken = connection.refresh_token;

    async function xeroGet(apiUrl: string): Promise<Response> {
      let res = await fetch(apiUrl, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Xero-tenant-id": connection.provider_tenant_id,
          Accept: "application/json",
        },
      });

      if (res.status === 401) {
        const refreshed = await refreshXeroToken(refreshToken);
        accessToken = refreshed.access_token;
        refreshToken = refreshed.refresh_token;

        await supabase
          .from("accounting_connections")
          .update({
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token,
            token_expires_at: new Date(
              Date.now() + Number(refreshed.expires_in || 0) * 1000
            ).toISOString(),
          })
          .eq("id", connection.id);

        res = await fetch(apiUrl, {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Xero-tenant-id": connection.provider_tenant_id,
            Accept: "application/json",
          },
        });
      }

      return res;
    }

    const { fromDate, toDate } = getLast12MonthsWindow();
    const fromIso = isoDate(fromDate);
    const toIso = isoDate(toDate);

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

    let totalRecordsProcessed = 0;
    let totalLinesImported = 0;
    let totalLinesSkipped = 0;

    // ── 1. INVOICES ────────────────────────────────────────────
    // Xero requires fetching invoices in pages of 100 max with
    // page parameter to get full line item detail.
    // summaryOnly=false alone is not enough — we must paginate.
    let invoicePage = 1;
    let invoicesDone = false;

    while (!invoicesDone) {
      const invoicesRes = await xeroGet(
        `https://api.xero.com/api.xro/2.0/Invoices` +
          `?Type=ACCREC` +
          `&where=Date%3E%3DDateTime(${fromDate.getFullYear()}%2C${fromDate.getMonth() + 1}%2C${fromDate.getDate()})%26%26Date%3C%3DDateTime(${toDate.getFullYear()}%2C${toDate.getMonth() + 1}%2C${toDate.getDate()})` +
          `&page=${invoicePage}` +
          `&summaryOnly=false`
      );

      if (!invoicesRes.ok) {
        // Don't fail the whole import — just stop fetching invoices
        invoicesDone = true;
        break;
      }

      const invoicesJson = await invoicesRes.json();
      const invoices = invoicesJson.Invoices || [];

      if (invoices.length === 0) {
        invoicesDone = true;
        break;
      }

      for (const invoice of invoices) {
        totalRecordsProcessed++;
        const date = parseXeroDate(invoice.Date || invoice.DateString) || new Date();
        const lines = invoice.LineItems || [];

        for (const [i, line] of lines.entries()) {
          const code = String(line.AccountCode || "").trim();
          const classification = accountMap.get(code);

          if (!classification || classification === "excluded") {
            totalLinesSkipped++;
            continue;
          }

          const amount = Math.abs(safeNumber(line.LineAmount));
          if (amount === 0) continue;

          importedLines.push({
            client_id: clientId,
            source: "invoices",
            source_record_id: invoice.InvoiceID,
            source_line_key: `invoices_${invoice.InvoiceID}_${i}_${code}`,
            transaction_date: isoDate(date),
            account_code: code,
            account_name: null,
            description: line.Description || null,
            tax_type: line.TaxType || null,
            vat_classification: classification,
            amount: Number(amount.toFixed(2)),
            updated_at: new Date().toISOString(),
          });
          totalLinesImported++;
        }
      }

      // Xero returns max 100 per page — if less than 100 we're done
      if (invoices.length < 100) {
        invoicesDone = true;
      } else {
        invoicePage++;
      }
    }

    // ── 2. BANK TRANSACTIONS (receipts only) ──────────────────
    // Xero bank transactions come back differently to invoices.
    // "Receive Money" transactions post to an income account directly.
    // The account code can be on the transaction OR on its line items.
    let bankPage = 1;
    let bankDone = false;

    while (!bankDone) {
      const bankRes = await xeroGet(
        `https://api.xero.com/api.xro/2.0/BankTransactions` +
          `?where=Type%3D%3D%22RECEIVE%22` +
          `%26%26Date%3E%3DDateTime(${fromDate.getFullYear()}%2C${fromDate.getMonth() + 1}%2C${fromDate.getDate()})` +
          `%26%26Date%3C%3DDateTime(${toDate.getFullYear()}%2C${toDate.getMonth() + 1}%2C${toDate.getDate()})` +
          `&page=${bankPage}`
      );

      if (!bankRes.ok) { bankDone = true; break; }

      const bankJson = await bankRes.json();
      const transactions = bankJson.BankTransactions || [];

      if (transactions.length === 0) { bankDone = true; break; }

      for (const txn of transactions) {
        totalRecordsProcessed++;
        const date = parseXeroDate(txn.Date || txn.DateString) || new Date();
        const lines = txn.LineItems || [];

        if (lines.length > 0) {
          // Has line items — process each one
          for (const [i, line] of lines.entries()) {
            const code = String(line.AccountCode || "").trim();
            const classification = accountMap.get(code);

            if (!classification || classification === "excluded") {
              totalLinesSkipped++;
              continue;
            }

            const amount = Math.abs(safeNumber(line.LineAmount ?? line.UnitAmount ?? 0));
            if (amount === 0) continue;

            importedLines.push({
              client_id: clientId,
              source: "bank_transactions",
              source_record_id: txn.BankTransactionID,
              source_line_key: `bank_${txn.BankTransactionID}_${i}_${code}`,
              transaction_date: isoDate(date),
              account_code: code,
              account_name: null,
              description: line.Description || txn.Reference || null,
              tax_type: line.TaxType || null,
              vat_classification: classification,
              amount: Number(amount.toFixed(2)),
              updated_at: new Date().toISOString(),
            });
            totalLinesImported++;
          }
        } else {
          // No line items — use the transaction-level account code
          // This is common for simple Receive Money entries
          const code = String(txn.LineItems?.[0]?.AccountCode || "").trim();
          const fallbackCode = String(txn.Account?.Code || txn.AccountCode || "").trim();
          const resolvedCode = code || fallbackCode;
          const classification = resolvedCode ? accountMap.get(resolvedCode) : undefined;

          if (!classification || classification === "excluded") {
            totalLinesSkipped++;
            continue;
          }

          const amount = Math.abs(safeNumber(txn.Total || txn.SubTotal || 0));
          if (amount === 0) { totalLinesSkipped++; continue; }

          importedLines.push({
            client_id: clientId,
            source: "bank_transactions",
            source_record_id: txn.BankTransactionID,
            source_line_key: `bank_${txn.BankTransactionID}_0_${resolvedCode}`,
            transaction_date: isoDate(date),
            account_code: resolvedCode,
            account_name: null,
            description: txn.Reference || txn.Narration || null,
            tax_type: txn.LineItems?.[0]?.TaxType || null,
            vat_classification: classification,
            amount: Number(amount.toFixed(2)),
            updated_at: new Date().toISOString(),
          });
          totalLinesImported++;
        }
      }

      if (transactions.length < 100) { bankDone = true; } else { bankPage++; }
    }

    // ── 3. MANUAL JOURNALS ────────────────────────────────────
    // For income accounts, credit entries (negative LineAmount) = income posted
    // We also need to paginate journals
    let journalPage = 1;
    let journalsDone = false;

    while (!journalsDone) {
      const journalsRes = await xeroGet(
        `https://api.xero.com/api.xro/2.0/ManualJournals` +
          `?where=Date%3E%3DDateTime(${fromDate.getFullYear()}%2C${fromDate.getMonth() + 1}%2C${fromDate.getDate()})` +
          `%26%26Date%3C%3DDateTime(${toDate.getFullYear()}%2C${toDate.getMonth() + 1}%2C${toDate.getDate()})` +
          `&page=${journalPage}`
      );

    if (!journalsRes.ok) { journalsDone = true; break; }

    const journalsJson = await journalsRes.json();
    const journals = journalsJson.ManualJournals || [];

    if (journals.length === 0) { journalsDone = true; break; }

      for (const journal of journals) {
        totalRecordsProcessed++;
        const date = parseXeroDate(journal.Date || journal.DateString) || new Date();
        const lines = journal.JournalLines || [];

        for (const [i, line] of lines.entries()) {
          const code = String(line.AccountCode || "").trim();
          const classification = accountMap.get(code);

          if (!classification || classification === "excluded") {
            totalLinesSkipped++;
            continue;
          }

          // For manual journals posting to income accounts:
          // In double-entry, income accounts are CREDITED (negative in Xero's convention)
          // BUT some Xero setups show income journals as positive LineAmount
          // We take the absolute value and include any non-zero line on an income account
          const amount = safeNumber(line.LineAmount);
          const absAmount = Math.abs(amount);
          if (absAmount === 0) continue;

          importedLines.push({
            client_id: clientId,
            source: "manual_journals",
            source_record_id: journal.ManualJournalID,
            source_line_key: `journal_${journal.ManualJournalID}_${i}_${code}`,
            transaction_date: isoDate(date),
            account_code: code,
            account_name: null,
            description: line.Description || journal.Narration || null,
            tax_type: line.TaxType || null,
            vat_classification: classification,
            amount: Number(absAmount.toFixed(2)),
            updated_at: new Date().toISOString(),
          });
          totalLinesImported++;
        }
      }

      if (journals.length < 100) { journalsDone = true; } else { journalPage++; }
    }

    // Save all imported lines
    if (importedLines.length > 0) {
      const { error: upsertError } = await supabase
        .from("xero_imported_lines")
        .upsert(importedLines, {
          onConflict: "client_id,source_line_key",
        });

      if (upsertError) {
        return NextResponse.json(
          {
            ok: false,
            error: "Failed to save imported lines",
            details: upsertError.message,
          },
          { status: 500 }
        );
      }
    }

    // Now bucket into monthly turnover
    type MonthBucket = {
      month_label: string;
      standard_rated: number;
      reduced_rated: number;
      zero_rated: number;
      exempt: number;
      out_of_scope: number;
    };

    const buckets = new Map<string, MonthBucket>();

    for (const line of importedLines) {
      const date = new Date(line.transaction_date);
      const key = monthKey(date);
      const label = monthLabel(date);

      if (!buckets.has(key)) {
        buckets.set(key, {
          month_label: label,
          standard_rated: 0,
          reduced_rated: 0,
          zero_rated: 0,
          exempt: 0,
          out_of_scope: 0,
        });
      }

      const bucket = buckets.get(key)!;
      const classification = line.vat_classification as VatClassification;

      if (classification === "standard_rated") bucket.standard_rated += line.amount;
      else if (classification === "reduced_rated") bucket.reduced_rated += line.amount;
      else if (classification === "zero_rated") bucket.zero_rated += line.amount;
      else if (classification === "exempt") bucket.exempt += line.amount;
      else if (classification === "out_of_scope") bucket.out_of_scope += line.amount;
    }

    const turnoverRows = Array.from(buckets.values()).map((b) => ({
      client_id: clientId,
      month_label: b.month_label,
      standard_rated: Number(b.standard_rated.toFixed(2)),
      reduced_rated: Number(b.reduced_rated.toFixed(2)),
      zero_rated: Number(b.zero_rated.toFixed(2)),
      exempt: Number(b.exempt.toFixed(2)),
      out_of_scope: Number(b.out_of_scope.toFixed(2)),
      source: "xero",
    }));

    if (turnoverRows.length > 0) {
      await supabase
        .from("turnover_entries")
        .upsert(turnoverRows, { onConflict: "client_id,month_label,source" });
    }

    // Calculate rolling VAT position
    const rollingTurnover = turnoverRows.reduce(
      (sum, row) =>
        sum +
        Number(row.standard_rated) +
        Number(row.reduced_rated) +
        Number(row.zero_rated),
      0
    );

    const thresholdPercent = (rollingTurnover / 90000) * 100;

    const riskStatus =
      rollingTurnover >= 90000
        ? "Registration Required"
        : rollingTurnover >= 81000
        ? "High Risk"
        : rollingTurnover >= 72000
        ? "Warning"
        : rollingTurnover >= 63000
        ? "Watch"
        : "Low Risk";

    // Save VAT review
    await supabase.from("vat_reviews").insert({
      client_id: clientId,
      rolling_taxable_turnover: Number(rollingTurnover.toFixed(2)),
      expected_next_30_days: 0,
      risk_status: riskStatus,
      advice_note: `Xero import completed. ${totalLinesImported} lines imported from ${totalRecordsProcessed} records (invoices, bank transactions and manual journals).${warnings.length > 0 ? " " + warnings.join(" ") : ""}`,
    });

    // Create alert if needed
    let alertType: string | null = null;
    let alertMessage = "";

    if (thresholdPercent >= 100) {
      alertType = "BREACH";
      alertMessage = "VAT threshold exceeded — registration required immediately.";
    } else if (thresholdPercent >= 95) {
      alertType = "CRITICAL";
      alertMessage = "VAT turnover above 95% of threshold — review immediately.";
    } else if (thresholdPercent >= 90) {
      alertType = "HIGH";
      alertMessage = "VAT turnover above 90% of threshold — urgent review required.";
    } else if (thresholdPercent >= 80) {
      alertType = "WARNING";
      alertMessage = "VAT turnover above 80% of threshold — monitor closely.";
    } else if (thresholdPercent >= 70) {
      alertType = "WATCH";
      alertMessage = "VAT turnover above 70% of threshold — entering monitoring zone.";
    }

    if (alertType) {
      await supabase.from("vat_alerts").insert({
        client_id: clientId,
        threshold_percentage: Number(thresholdPercent.toFixed(2)),
        alert_type: alertType,
        message: alertMessage,
      });
    }

    return NextResponse.json({
      ok: true,
      message: "Xero import complete",
      clientId,
      clientName: client.name,
      importWindow: { from: fromIso, to: toIso },
      accountMappingsLoaded: accountMap.size,
      accountCodesInMap: Array.from(accountMap.keys()),
      totalRecordsProcessed,
      totalLinesImported,
      totalLinesSkipped,
      rollingTurnover: Number(rollingTurnover.toFixed(2)),
      thresholdPercent: Number(thresholdPercent.toFixed(2)),
      riskStatus,
      alertType,
      warnings,
      monthlyBreakdown: turnoverRows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unexpected import failure",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
