import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 5;

type SourceType =
  | "invoices"
  | "bank_transactions"
  | "manual_journals";

type XeroAccount = {
  Code?: string;
  Name?: string;
  Type?: string;
  Status?: string;
  Class?: string;
};

type XeroLineItem = {
  Description?: string;
  LineAmount?: number;
  TaxType?: string;
  AccountCode?: string;
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

  if (match?.[1]) {
    return new Date(Number(match[1]));
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function sourceFromParam(value: string | null): SourceType {
  if (value === "bank_transactions") {
    return "bank_transactions";
  }

  if (value === "manual_journals") {
    return "manual_journals";
  }

  return "invoices";
}

function isRevenueAccount(account: XeroAccount | undefined) {
  if (!account) return false;

  const type = String(account.Type || "").toUpperCase();
  const accountClass = String(account.Class || "").toUpperCase();
  const status = String(account.Status || "").toUpperCase();

  if (status === "ARCHIVED") {
    return false;
  }

  return (
    type === "REVENUE" ||
    type === "SALES" ||
    type === "OTHERINCOME" ||
    accountClass === "REVENUE"
  );
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const clientId = url.searchParams.get("clientId");

    const source = sourceFromParam(
      url.searchParams.get("source")
    );

    const offset = Math.max(
      Number(url.searchParams.get("offset") || 0),
      0
    );

    const limit = Math.min(
      Math.max(
        Number(
          url.searchParams.get("limit") || DEFAULT_LIMIT
        ),
        1
      ),
      MAX_LIMIT
    );

    const debug =
      url.searchParams.get("debug") === "true";

    if (!clientId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing clientId",
        },
        {
          status: 400,
        }
      );
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

    const { data: connection } = await supabase
      .from("accounting_connections")
      .select("*")
      .eq("client_id", clientId)
      .eq("provider", "xero")
      .order("connected_at", {
        ascending: false,
      })
      .limit(1)
      .single();

    if (!connection) {
      return NextResponse.json(
        {
          ok: false,
          error: "No Xero connection found",
        },
        {
          status: 404,
        }
      );
    }

    let accessToken = connection.access_token;

    async function xeroFetch(apiUrl: string) {
      return fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Xero-tenant-id":
            connection.provider_tenant_id,
          Accept: "application/json",
        },
      });
    }

    const accountsResponse = await xeroFetch(
      "https://api.xero.com/api.xro/2.0/Accounts"
    );

    if (!accountsResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Xero Accounts call failed",
          status: accountsResponse.status,
          details: await accountsResponse.text(),
        },
        {
          status: 400,
        }
      );
    }

    const accountsJson =
      await accountsResponse.json();

    const accounts: XeroAccount[] =
      accountsJson.Accounts || [];

    const accountMap = new Map<
      string,
      XeroAccount
    >();

    for (const account of accounts) {
      const code = normaliseAccountCode(
        account.Code
      );

      if (code) {
        accountMap.set(code, account);
      }
    }

    function lineIsRevenue(
      accountCode: string | undefined
    ) {
      const code =
        normaliseAccountCode(accountCode);

      const account = accountMap.get(code);

      return isRevenueAccount(account);
    }

    let listUrl = "";
    let listKey = "";
    let detailIdKey = "";
    let detailBase = "";

    if (source === "bank_transactions") {
      listUrl =
        "https://api.xero.com/api.xro/2.0/BankTransactions";

      listKey = "BankTransactions";

      detailIdKey = "BankTransactionID";

      detailBase =
        "https://api.xero.com/api.xro/2.0/BankTransactions";
    }

    if (source === "invoices") {
      listUrl =
        "https://api.xero.com/api.xro/2.0/Invoices";

      listKey = "Invoices";

      detailIdKey = "InvoiceID";

      detailBase =
        "https://api.xero.com/api.xro/2.0/Invoices";
    }

    if (source === "manual_journals") {
      listUrl =
        "https://api.xero.com/api.xro/2.0/ManualJournals";

      listKey = "ManualJournals";

      detailIdKey = "ManualJournalID";

      detailBase =
        "https://api.xero.com/api.xro/2.0/ManualJournals";
    }

    const listResponse = await xeroFetch(listUrl);

    if (!listResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Xero list call failed",
          status: listResponse.status,
          details: await listResponse.text(),
        },
        {
          status: 400,
        }
      );
    }

    const listJson = await listResponse.json();

    const records = listJson[listKey] || [];

    const batch = records.slice(
      offset,
      offset + limit
    );

    let recordsImported = 0;
    let recordsSkipped = 0;
    let linesImported = 0;

    const importedRecords: any[] = [];
    const skippedRecords: any[] = [];
    const debugLines: any[] = [];

    for (const summary of batch) {
      const recordId =
        summary?.[detailIdKey];

      if (!recordId) {
        recordsSkipped += 1;
        continue;
      }

      const detailResponse = await xeroFetch(
        `${detailBase}/${recordId}`
      );

      if (!detailResponse.ok) {
        recordsSkipped += 1;
        continue;
      }

      const detailJson =
        await detailResponse.json();

      const record =
        detailJson[listKey]?.[0];

      if (!record) {
        recordsSkipped += 1;
        continue;
      }

      const lineItems =
        record.LineItems ||
        record.JournalLines ||
        [];

      let importedThisRecord = 0;

      for (const [lineIndex, line] of lineItems.entries()) {
        const accountCode =
          normaliseAccountCode(
            line.AccountCode
          );

        const revenueMatched =
          lineIsRevenue(accountCode);

        if (!revenueMatched) {
          continue;
        }

        const amount = Math.abs(
          safeNumber(line.LineAmount)
        );

        if (amount === 0) {
          continue;
        }

        const date =
          parseXeroDate(
            record.Date ||
              record.DateString
          ) || new Date();

        const sourceLineKey = `${source}_${recordId}_${lineIndex}_${accountCode}`;

        const upsertPayload = {
          client_id: clientId,
          source,
          source_record_id: recordId,
          source_line_key: sourceLineKey,
          transaction_date: isoDate(date),
          account_code: accountCode,
          account_name:
            accountMap.get(accountCode)
              ?.Name || null,
          description:
            line.Description || null,
          tax_type:
            line.TaxType || null,
          amount,
          updated_at:
            new Date().toISOString(),
        };

        const { error } = await supabase
          .from("xero_imported_lines")
          .upsert(upsertPayload, {
            onConflict:
              "client_id,source_line_key",
          });

        if (!error) {
          linesImported += 1;
          importedThisRecord += 1;
        }

        if (debug) {
          debugLines.push({
            recordId,
            accountCode,
            amount,
            revenueMatched,
          });
        }
      }

      if (importedThisRecord > 0) {
        recordsImported += 1;

        importedRecords.push({
          id: recordId,
          importedLines:
            importedThisRecord,
        });
      } else {
        recordsSkipped += 1;

        skippedRecords.push({
          id: recordId,
          reason:
            "no_revenue_lines_found",
        });
      }
    }

    const nextOffset = offset + limit;

    const done =
      nextOffset >= records.length;

    return NextResponse.json({
      ok: true,
      message:
        "Production Xero batch import complete",
      clientId,
      clientName: client?.name || null,
      source,
      offset,
      limit,
      nextOffset: done
        ? null
        : nextOffset,
      done,
      totalAvailable: records.length,
      recordsInThisBatch:
        batch.length,
      recordsImported,
      recordsSkipped,
      linesImported,
      importedRecords,
      skippedRecords,
      debugLines: debug
        ? debugLines
        : undefined,
      nextUrl: done
        ? null
        : `/api/xero/import?clientId=${clientId}&source=${source}&offset=${nextOffset}&limit=${limit}&debug=${debug}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
      }
    );
  }
}
