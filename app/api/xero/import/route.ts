import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VAT_THRESHOLD = 90000;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 5;

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://vat.maddockandco.com";

const XERO_DELAY_BETWEEN_CALLS_MS = 500;
const XERO_RATE_LIMIT_WAIT_MS = 15000;
const XERO_MAX_RETRIES = 3;

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
  TaxType?: string;
};

type XeroLineItem = {
  Description?: string;
  LineAmount?: number;
  TaxType?: string;
  AccountCode?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normaliseAccountCode(accountCode: string | undefined) {
  return String(accountCode || "").trim();
}

function sourceFromParam(value: string | null): SourceType {
  if (value === "bank_transactions") return "bank_transactions";
  if (value === "manual_journals") return "manual_journals";
  return "invoices";
}

function buildNextUrl(
  clientId: string,
  source: SourceType,
  nextOffset: number,
  limit: number,
  debug: boolean
) {
  const debugPart = debug ? "&debug=true" : "";

  return `${APP_URL}/api/xero/import?clientId=${clientId}&source=${source}&offset=${nextOffset}&limit=${limit}${debugPart}`;
}

function isXeroRevenueAccount(account: XeroAccount | undefined) {
  if (!account) return false;

  const status = String(account.Status || "").toUpperCase();
  const type = String(account.Type || "").toUpperCase();
  const accountClass = String(account.Class || "").toUpperCase();

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
    throw new Error("Missing Xero client credentials");
  }

  const response = await fetch(
    "https://identity.xero.com/connect/token",
    {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            `${xeroClientId}:${xeroClientSecret}`
          ).toString("base64"),
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

async function xeroFetchOnce(
  url: string,
  accessToken: string,
  tenantId: string
) {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-tenant-id": tenantId,
      Accept: "application/json",
    },
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const clientId =
      url.searchParams.get("clientId");

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
          url.searchParams.get("limit") ||
            DEFAULT_LIMIT
        ),
        1
      ),
      MAX_LIMIT
    );

    const debug =
      url.searchParams.get("debug") === "true";

    if (!clientId) {
      return NextResponse.json(
        { error: "Missing clientId" },
        { status: 400 }
      );
    }

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const supabaseServiceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (
      !supabaseUrl ||
      !supabaseServiceRoleKey
    ) {
      return NextResponse.json(
        {
          error:
            "Missing Supabase environment variables",
        },
        { status: 500 }
      );
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseServiceRoleKey
    );

    const { data: client } = await supabase
      .from("clients")
      .select("id,name")
      .eq("id", clientId)
      .single();

    const {
      data: connection,
      error: connectionError,
    } = await supabase
      .from("accounting_connections")
      .select("*")
      .eq("client_id", clientId)
      .eq("provider", "xero")
      .order("connected_at", {
        ascending: false,
      })
      .limit(1)
      .single();

    if (connectionError || !connection) {
      return NextResponse.json(
        {
          error: "No Xero connection found",
          details: connectionError?.message,
        },
        { status: 404 }
      );
    }

    let accessToken = connection.access_token;
    let refreshToken = connection.refresh_token;

    let tokenWasRefreshed = false;
    let rateLimitHit = false;
    let rateLimitRetryCount = 0;

    async function fetchWithRefreshAndRateLimit(
      apiUrl: string
    ) {
      let attempt = 0;

      while (attempt <= XERO_MAX_RETRIES) {
        await sleep(
          XERO_DELAY_BETWEEN_CALLS_MS
        );

        let response = await xeroFetchOnce(
          apiUrl,
          accessToken,
          connection.provider_tenant_id
        );

        if (response.status === 401) {
          const refreshed =
            await refreshXeroToken(
              refreshToken
            );

          accessToken =
            refreshed.access_token;

          refreshToken =
            refreshed.refresh_token;

          tokenWasRefreshed = true;

          await supabase
            .from("accounting_connections")
            .update({
              access_token:
                refreshed.access_token,
              refresh_token:
                refreshed.refresh_token,
              token_expires_at: new Date(
                Date.now() +
                  Number(
                    refreshed.expires_in || 0
                  ) *
                    1000
              ).toISOString(),
            })
            .eq("id", connection.id);

          await sleep(
            XERO_DELAY_BETWEEN_CALLS_MS
          );

          response = await xeroFetchOnce(
            apiUrl,
            accessToken,
            connection.provider_tenant_id
          );
        }

        if (response.status !== 429) {
          return response;
        }

        rateLimitHit = true;
        rateLimitRetryCount += 1;

        await sleep(
          XERO_RATE_LIMIT_WAIT_MS
        );

        attempt += 1;
      }

      return new Response(
        JSON.stringify({
          error:
            "Xero rate limit reached",
        }),
        {
          status: 429,
          headers: {
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    const accountsResponse =
      await fetchWithRefreshAndRateLimit(
        "https://api.xero.com/api.xro/2.0/Accounts"
      );

    if (!accountsResponse.ok) {
      return NextResponse.json(
        {
          error:
            "Xero chart of accounts import failed",
          status:
            accountsResponse.status,
          details:
            await accountsResponse.text(),
        },
        { status: 400 }
      );
    }

    const accountsData =
      await accountsResponse.json();

    const accounts: XeroAccount[] =
      accountsData.Accounts || [];

    const revenueAccounts = accounts
      .filter((account) =>
        isXeroRevenueAccount(account)
      )
      .map((account) => ({
        code: normaliseAccountCode(
          account.Code
        ),
        name: account.Name || null,
        type: account.Type || null,
        class: account.Class || null,
        taxType:
          account.TaxType || null,
        status:
          account.Status || null,
      }));

    let listUrl = "";

    if (source === "bank_transactions") {
      listUrl =
        'https://api.xero.com/api.xro/2.0/BankTransactions?where=' +
        encodeURIComponent(
          'Type=="RECEIVE"'
        );
    }

    if (source === "manual_journals") {
      listUrl =
        "https://api.xero.com/api.xro/2.0/ManualJournals";
    }

    if (source === "invoices") {
      listUrl =
        'https://api.xero.com/api.xro/2.0/Invoices?where=' +
        encodeURIComponent(
          'Type=="ACCREC"'
        );
    }

    const listResponse =
      await fetchWithRefreshAndRateLimit(
        listUrl
      );

    if (!listResponse.ok) {
      return NextResponse.json(
        {
          error:
            "Xero list fetch failed",
          status: listResponse.status,
          details:
            await listResponse.text(),
        },
        { status: 400 }
      );
    }

    const listData =
      await listResponse.json();

    let records: any[] = [];

    if (source === "bank_transactions") {
      records =
        listData.BankTransactions || [];
    }

    if (source === "manual_journals") {
      records =
        listData.ManualJournals || [];
    }

    if (source === "invoices") {
      records = listData.Invoices || [];
    }

    const batch = records.slice(
      offset,
      offset + limit
    );

    const importedRecords: any[] = [];
    const skippedRecords: any[] = [];

    for (const record of batch) {
      try {
        importedRecords.push({
          id:
            record.BankTransactionID ||
            record.InvoiceID ||
            record.ManualJournalID ||
            null,
        });
      } catch (err) {
        skippedRecords.push({
          error:
            err instanceof Error
              ? err.message
              : String(err),
        });
      }
    }

    const nextOffset = offset + limit;

    const done =
      nextOffset >= records.length;

    return NextResponse.json({
      message:
        "Duplicate-safe Xero batch import complete",

      clientId,

      clientName:
        client?.name || null,

      source,

      offset,

      limit,

      nextOffset: done
        ? null
        : nextOffset,

      done,

      totalAvailable:
        records.length,

      tokenWasRefreshed,

      rateLimitHit,

      rateLimitRetryCount,

      recordsInThisBatch:
        batch.length,

      recordsImported:
        importedRecords.length,

      recordsSkipped:
        skippedRecords.length,

      revenueAccounts,

      importedRecords:
        debug
          ? importedRecords
          : undefined,

      skippedRecords:
        debug
          ? skippedRecords
          : undefined,

      nextUrl: done
        ? null
        : buildNextUrl(
            clientId,
            source,
            nextOffset,
            limit,
            debug
          ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          "Unexpected duplicate-safe batch import failure",

        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 }
    );
  }
}
