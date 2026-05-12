import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 5;

type SourceType = "invoices" | "bank_transactions" | "manual_journals";

type XeroAccount = {
  Code?: string;
  Name?: string;
  Type?: string;
  Status?: string;
  Class?: string;
};

function safeNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normaliseAccountCode(value: string | undefined) {
  return String(value || "").trim();
}

function parseXeroDate(value: string | undefined): Date | null {
  if (!value) return null;
  const match = value.match(/\/Date\((\d+)/);
  if (match?.[1]) return new Date(Number(match[1]));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function sourceFromParam(value: string | null): SourceType {
  if (value === "bank_transactions") return "bank_transactions";
  if (value === "manual_journals") return "manual_journals";
  return "invoices";
}

function isRevenueAccount(account: XeroAccount | undefined) {
  if (!account) return false;

  const type = String(account.Type || "").toUpperCase();
  const accountClass = String(account.Class || "").toUpperCase();
  const status = String(account.Status || "").toUpperCase();

  if (status === "ARCHIVED") return false;

  return (
    type === "REVENUE" ||
    type === "SALES" ||
    type === "OTHERINCOME" ||
    accountClass === "REVENUE"
  );
}

async function refreshXeroToken(refreshToken: string) {
  const xeroClientId = process.env.XERO_CLIENT_ID;
  const xeroClientSecret = process.env.XERO_CLIENT_SECRET;

  if (!xeroClientId || !xeroClientSecret) {
    throw new Error("Missing XERO_CLIENT_ID or XERO_CLIENT_SECRET");
  }

  const response = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${xeroClientId}:${xeroClientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${await response.text()}`);
  }

  return response.json();
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const clientId = url.searchParams.get("clientId");
    const source = sourceFromParam(url.searchParams.get("source"));
    const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0);
    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit") || DEFAULT_LIMIT), 1),
      MAX_LIMIT
    );
    const debug = url.searchParams.get("debug") === "true";

    if (!clientId) {
      return NextResponse.json({ ok: false, error: "Missing clientId" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json(
        { ok: false, error: "Missing Supabase environment variables" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: client } = await supabase
      .from("clients")
      .select("id,name")
      .eq("id", clientId)
      .single();

    const { data: connection, error: connectionError } = await supabase
      .from("accounting_connections")
      .select("*")
      .eq("client_id", clientId)
      .eq("provider", "xero")
      .order("connected_at", { ascending: false })
      .limit(1)
      .single();

    if (connectionError || !connection) {
      return NextResponse.json(
        {
          ok: false,
          error: "No Xero connection found",
          details: connectionError?.message || null,
        },
        { status: 404 }
      );
    }

    let accessToken = connection.access_token;
    let refreshToken = connection.refresh_token;
    let tokenWasRefreshed = false;

    async function xeroFetch(apiUrl: string) {
      let response = await fetch(apiUrl, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Xero-tenant-id": connection.provider_tenant_id,
          Accept: "application/json",
        },
      });

      if (response.status === 401) {
        const refreshed = await refreshXeroToken(refreshToken);

        accessToken = refreshed.access_token;
        refreshToken = refreshed.refresh_token;
        tokenWasRefreshed = true;

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

        response = await fetch(apiUrl, {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Xero-tenant-id": connection.provider_tenant_id,
            Accept: "application/json",
          },
        });
      }

      return response;
    }

    async function handleXeroError(response: Response, stage: string) {
      const retryAfter = response.headers.get("Retry-After");
      const details = await response.text();

      return NextResponse.json(
        {
          ok: false,
          error: `${stage} failed`,
          status: response.status,
          retryAfterSeconds: retryAfter ? Number(retryAfter) : null,
          message:
            response.status === 429
              ? "Xero is temporarily rate limiting. Wait 60 seconds, then run the same URL again."
              : "Xero request failed.",
          details,
          tokenWasRefreshed,
        },
        { status: response.status === 429 ? 429 : 400 }
      );
    }

    const accountsResponse = await xeroFetch(
      "https://api.xero.com/api.xro/2.0/Accounts"
    );

    if (!accountsResponse.ok) {
      return handleXeroError(accountsResponse, "Xero Accounts call");
    }

    const accountsJson = await accountsResponse.json();
    const accounts: XeroAccount[] = accountsJson.Accounts || [];

    const accountMap = new Map<string, XeroAccount>();

    for (const account of accounts) {
      const code = normaliseAccountCode(account.Code);
      if (code) accountMap.set(code, account);
    }

    function lineIsRevenue(accountCode: string | undefined) {
      return isRevenueAccount(accountMap.get(normaliseAccountCode(accountCode)));
    }

    let listUrl = "";
    let listKey = "";
    let detailIdKey = "";
    let detailBase = "";

    if (source === "bank_transactions") {
      listUrl = "https://api.xero.com/api.xro/2.0/BankTransactions";
      listKey = "BankTransactions";
      detailIdKey = "BankTransactionID";
      detailBase = "https://api.xero.com/api.xro/2.0/BankTransactions";
    }

    if (source === "invoices") {
      listUrl = "https://api.xero.com/api.xro/2.0/Invoices";
      listKey = "Invoices";
      detailIdKey = "InvoiceID";
      detailBase = "https://api.xero.com/api.xro/2.0/Invoices";
    }

    if (source === "manual_journals") {
      listUrl = "https://api.xero.com/api.xro/2.0/ManualJournals";
      listKey = "ManualJournals";
      detailIdKey = "ManualJournalID";
      detailBase = "https://api.xero.com/api.xro/2.0/ManualJournals";
    }

    const listResponse = await xeroFetch(listUrl);

    if (!listResponse.ok) {
      return handleXeroError(listResponse, "Xero list call");
    }

    const listJson = await listResponse.json();
    const records = listJson[listKey] || [];
    const batch = records.slice(offset, offset + limit);

    let recordsImported = 0;
    let recordsSkipped = 0;
    let linesImported = 0;
    let linesUpserted = 0;

    const importedRecords: any[] = [];
    const skippedRecords: any[] = [];
    const debugLines: any[] = [];
    const importedLineRows: any[] = [];

    for (const summary of batch) {
      const recordId = summary?.[detailIdKey];

      if (!recordId) {
        recordsSkipped += 1;
        skippedRecords.push({ id: null, reason: "missing_record_id" });
        continue;
      }

      const detailResponse = await xeroFetch(`${detailBase}/${recordId}`);

      if (!detailResponse.ok) {
        if (detailResponse.status === 429) {
          return handleXeroError(detailResponse, `Xero detail call at offset ${offset}`);
        }

        recordsSkipped += 1;
        skippedRecords.push({
          id: recordId,
          reason: `detail_fetch_failed_${detailResponse.status}`,
        });
        continue;
      }

      const detailJson = await detailResponse.json();
      const record = detailJson[listKey]?.[0];

      if (!record) {
        recordsSkipped += 1;
        skippedRecords.push({ id: recordId, reason: "missing_detail_record" });
        continue;
      }

      const lineItems = record.LineItems || record.JournalLines || [];
      let importedThisRecord = 0;

      for (const [lineIndex, line] of lineItems.entries()) {
        const accountCode = normaliseAccountCode(line.AccountCode);
        const revenueMatched = lineIsRevenue(accountCode);
        const amount = Math.abs(safeNumber(line.LineAmount));

        if (debug) {
          debugLines.push({
            recordId,
            accountCode,
            accountName: accountMap.get(accountCode)?.Name || null,
            amount,
            taxType: line.TaxType || null,
            revenueMatched,
          });
        }

        if (!revenueMatched || amount === 0) continue;

        const date = parseXeroDate(record.Date || record.DateString) || new Date();
        const sourceLineKey = `${source}_${recordId}_${lineIndex}_${accountCode}`;

        importedLineRows.push({
          client_id: clientId,
          source,
          source_record_id: recordId,
          source_line_key: sourceLineKey,
          transaction_date: isoDate(date),
          account_code: accountCode,
          account_name: accountMap.get(accountCode)?.Name || null,
          description: line.Description || null,
          tax_type: line.TaxType || null,
          amount: Number(amount.toFixed(2)),
          updated_at: new Date().toISOString(),
        });

        linesImported += 1;
        importedThisRecord += 1;
      }

      if (importedThisRecord > 0) {
        recordsImported += 1;
        importedRecords.push({ id: recordId, importedLines: importedThisRecord });
      } else {
        recordsSkipped += 1;
        skippedRecords.push({ id: recordId, reason: "no_revenue_lines_found" });
      }
    }

    if (importedLineRows.length > 0) {
      const { error: upsertError } = await supabase
        .from("xero_imported_lines")
        .upsert(importedLineRows, {
          onConflict: "client_id,source_line_key",
        });

      if (upsertError) {
        return NextResponse.json(
          {
            ok: false,
            error: "Could not save imported Xero lines",
            details: upsertError.message,
          },
          { status: 500 }
        );
      }

      linesUpserted = importedLineRows.length;
    }

    const nextOffset = offset + limit;
    const done = nextOffset >= records.length;

    return NextResponse.json({
      ok: true,
      message: "Lightweight Xero batch import complete",
      clientId,
      clientName: client?.name || null,
      source,
      offset,
      limit,
      nextOffset: done ? null : nextOffset,
      done,
      totalAvailable: records.length,
      tokenWasRefreshed,
      recordsInThisBatch: batch.length,
      recordsImported,
      recordsSkipped,
      linesImported,
      linesUpserted,
      importedRecords,
      skippedRecords,
      debugLines: debug ? debugLines : undefined,
      nextUrl: done
        ? null
        : `/api/xero/import?clientId=${clientId}&source=${source}&offset=${nextOffset}&limit=${limit}&debug=${debug}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unexpected lightweight Xero import failure",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
