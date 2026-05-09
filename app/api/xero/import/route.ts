import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const VAT_THRESHOLD = 90000;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

type SourceType = "invoices" | "bank_transactions" | "manual_journals";

type VatCategory =
  | "standard_rated"
  | "reduced_rated"
  | "zero_rated"
  | "exempt"
  | "out_of_scope";

type MonthBucket = {
  month_label: string;
  month_key: string;
  standard_rated: number;
  reduced_rated: number;
  zero_rated: number;
  exempt: number;
  out_of_scope: number;
};

type XeroLineItem = {
  Description?: string;
  LineAmount?: number;
  TaxType?: string;
  TaxAmount?: number;
  AccountCode?: string;
};

type XeroInvoice = {
  InvoiceID?: string;
  Type?: string;
  Status?: string;
  DateString?: string;
  Date?: string;
  LineItems?: XeroLineItem[];
};

type XeroBankTransaction = {
  BankTransactionID?: string;
  Type?: string;
  Status?: string;
  DateString?: string;
  Date?: string;
  LineItems?: XeroLineItem[];
};

type XeroManualJournalLine = {
  Description?: string;
  LineAmount?: number;
  AccountCode?: string;
  TaxType?: string;
};

type XeroManualJournal = {
  ManualJournalID?: string;
  Narration?: string;
  Date?: string;
  Status?: string;
  JournalLines?: XeroManualJournalLine[];
};

function parseXeroDate(value: string | undefined): Date | null {
  if (!value) return null;

  const match = value.match(/\/Date\((\d+)/);
  if (match?.[1]) return new Date(Number(match[1]));

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatMonthLabel(date: Date) {
  return date.toLocaleString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function xeroDateTime(date: Date) {
  return `DateTime(${date.getFullYear()},${date.getMonth() + 1},${date.getDate()})`;
}

function getLastCompleted12Months(): {
  buckets: MonthBucket[];
  fromDate: Date;
  toDate: Date;
} {
  const today = new Date();
  const endMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const fromDate = new Date(endMonth.getFullYear(), endMonth.getMonth() - 11, 1);
  const toDate = new Date(endMonth.getFullYear(), endMonth.getMonth() + 1, 0);

  const buckets = Array.from({ length: 12 }, (_, index) => {
    const monthDate = new Date(
      endMonth.getFullYear(),
      endMonth.getMonth() - (11 - index),
      1
    );

    return {
      month_label: formatMonthLabel(monthDate),
      month_key: monthKey(monthDate),
      standard_rated: 0,
      reduced_rated: 0,
      zero_rated: 0,
      exempt: 0,
      out_of_scope: 0,
    };
  });

  return { buckets, fromDate, toDate };
}

function classifyTaxType(taxType: string | undefined): VatCategory {
  const value = String(taxType || "").toUpperCase();

  if (value.includes("ZERO") || value.includes("ZERORATED")) return "zero_rated";
  if (value.includes("EXEMPT")) return "exempt";
  if (value.includes("REDUCED") || value.includes("OUTPUT5")) return "reduced_rated";
  if (value.includes("OUTOFSCOPE")) return "out_of_scope";

  return "standard_rated";
}

function safeNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRevenueAccount(accountCode: string | undefined) {
  if (!accountCode) return false;

  const code = Number(String(accountCode).replace(/\D/g, ""));

  return code >= 200 && code < 999;
}

function addToBucket(bucket: MonthBucket, amount: number, taxType: string | undefined) {
  const category = classifyTaxType(taxType);
  bucket[category] += Math.abs(amount);
}

async function refreshXeroToken(refreshToken: string) {
  const xeroClientId = process.env.XERO_CLIENT_ID;
  const xeroClientSecret = process.env.XERO_CLIENT_SECRET;

  if (!xeroClientId || !xeroClientSecret) {
    throw new Error("Missing Xero client credentials");
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
    throw new Error(await response.text());
  }

  return response.json();
}

async function xeroFetch(url: string, accessToken: string, tenantId: string) {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-tenant-id": tenantId,
      Accept: "application/json",
    },
  });
}

function sourceFromParam(value: string | null): SourceType {
  if (value === "bank_transactions") return "bank_transactions";
  if (value === "manual_journals") return "manual_journals";
  return "invoices";
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
    const reset = url.searchParams.get("reset") === "true";

    if (!clientId) {
      return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
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
          error: "No Xero connection found",
          details: connectionError?.message,
        },
        { status: 404 }
      );
    }

    if (reset && offset === 0) {
      await supabase
        .from("turnover_entries")
        .delete()
        .eq("client_id", clientId)
        .eq("source", "xero");
    }

    let accessToken = connection.access_token;
    let refreshToken = connection.refresh_token;
    let tokenWasRefreshed = false;

    async function fetchWithRefresh(apiUrl: string) {
      let response = await xeroFetch(
        apiUrl,
        accessToken,
        connection.provider_tenant_id
      );

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

        response = await xeroFetch(
          apiUrl,
          accessToken,
          connection.provider_tenant_id
        );
      }

      return response;
    }

    const { buckets, fromDate, toDate } = getLastCompleted12Months();
    const bucketMap = new Map<string, MonthBucket>();

    buckets.forEach((bucket) => bucketMap.set(bucket.month_key, bucket));

    const fromFilter = xeroDateTime(fromDate);
    const toFilter = xeroDateTime(toDate);

    let listUrl = "";
    let listKey = "";
    let detailIdKey = "";
    let detailUrlBase = "";

    if (source === "invoices") {
      listUrl =
        "https://api.xero.com/api.xro/2.0/Invoices" +
        `?where=${encodeURIComponent(
          `Type=="ACCREC"&&Date>=${fromFilter}&&Date<=${toFilter}`
        )}`;
      listKey = "Invoices";
      detailIdKey = "InvoiceID";
      detailUrlBase = "https://api.xero.com/api.xro/2.0/Invoices";
    }

    if (source === "bank_transactions") {
      listUrl =
        "https://api.xero.com/api.xro/2.0/BankTransactions" +
        `?where=${encodeURIComponent(
          `Type=="RECEIVE"&&Date>=${fromFilter}&&Date<=${toFilter}`
        )}`;
      listKey = "BankTransactions";
      detailIdKey = "BankTransactionID";
      detailUrlBase = "https://api.xero.com/api.xro/2.0/BankTransactions";
    }

    if (source === "manual_journals") {
      listUrl =
        "https://api.xero.com/api.xro/2.0/ManualJournals" +
        `?where=${encodeURIComponent(`Date>=${fromFilter}&&Date<=${toFilter}`)}`;
      listKey = "ManualJournals";
      detailIdKey = "ManualJournalID";
      detailUrlBase = "https://api.xero.com/api.xro/2.0/ManualJournals";
    }

    const listResponse = await fetchWithRefresh(listUrl);

    if (!listResponse.ok) {
      return NextResponse.json(
        {
          error: `${source} list import failed`,
          status: listResponse.status,
          details: await listResponse.text(),
        },
        { status: listResponse.status === 429 ? 429 : 400 }
      );
    }

    const listData = await listResponse.json();
    const summaries = listData[listKey] || [];
    const batch = summaries.slice(offset, offset + limit);

    let recordsImported = 0;
    let linesImported = 0;
    let recordsSkipped = 0;

    for (const summary of batch) {
      const recordId = summary?.[detailIdKey];

      if (!recordId) {
        recordsSkipped += 1;
        continue;
      }

      const detailResponse = await fetchWithRefresh(`${detailUrlBase}/${recordId}`);

      if (!detailResponse.ok) {
        recordsSkipped += 1;
        continue;
      }

      const detailData = await detailResponse.json();
      const record = detailData[listKey]?.[0];

      if (!record) {
        recordsSkipped += 1;
        continue;
      }

      if (source === "invoices") {
        const invoice = record as XeroInvoice;

        if (invoice.Type !== "ACCREC") continue;
        if (invoice.Status === "VOIDED" || invoice.Status === "DELETED") continue;

        const recordDate = parseXeroDate(invoice.DateString || invoice.Date);
        if (!recordDate) continue;

        const bucket = bucketMap.get(monthKey(recordDate));
        if (!bucket) continue;

        for (const line of invoice.LineItems || []) {
          const amount = safeNumber(line.LineAmount);
          if (amount === 0) continue;

          addToBucket(bucket, amount, line.TaxType);
          linesImported += 1;
        }

        recordsImported += 1;
      }

      if (source === "bank_transactions") {
        const transaction = record as XeroBankTransaction;

        if (transaction.Type !== "RECEIVE") continue;
        if (transaction.Status === "VOIDED" || transaction.Status === "DELETED") continue;

        const recordDate = parseXeroDate(transaction.DateString || transaction.Date);
        if (!recordDate) continue;

        const bucket = bucketMap.get(monthKey(recordDate));
        if (!bucket) continue;

        let counted = false;

        for (const line of transaction.LineItems || []) {
          if (!isRevenueAccount(line.AccountCode)) continue;

          const amount = safeNumber(line.LineAmount);
          if (amount === 0) continue;

          addToBucket(bucket, amount, line.TaxType);
          linesImported += 1;
          counted = true;
        }

        if (counted) recordsImported += 1;
        else recordsSkipped += 1;
      }

      if (source === "manual_journals") {
        const journal = record as XeroManualJournal;

        if (journal.Status !== "POSTED") continue;

        const recordDate = parseXeroDate(journal.Date);
        if (!recordDate) continue;

        const bucket = bucketMap.get(monthKey(recordDate));
        if (!bucket) continue;

        let counted = false;

        for (const line of journal.JournalLines || []) {
          if (!isRevenueAccount(line.AccountCode)) continue;

          const amount = safeNumber(line.LineAmount);
          if (amount === 0) continue;

          addToBucket(bucket, amount, line.TaxType);
          linesImported += 1;
          counted = true;
        }

        if (counted) recordsImported += 1;
        else recordsSkipped += 1;
      }
    }

    const { data: existingRows } = await supabase
      .from("turnover_entries")
      .select(
        "client_id,month_label,standard_rated,reduced_rated,zero_rated,exempt,out_of_scope,source"
      )
      .eq("client_id", clientId)
      .eq("source", "xero");

    const rowsToUpsert = buckets.map((bucket) => {
      const existing = existingRows?.find(
        (row) => row.month_label === bucket.month_label
      );

      return {
        client_id: clientId,
        month_label: bucket.month_label,
        standard_rated: Number(
          (Number(existing?.standard_rated || 0) + bucket.standard_rated).toFixed(2)
        ),
        reduced_rated: Number(
          (Number(existing?.reduced_rated || 0) + bucket.reduced_rated).toFixed(2)
        ),
        zero_rated: Number(
          (Number(existing?.zero_rated || 0) + bucket.zero_rated).toFixed(2)
        ),
        exempt: Number((Number(existing?.exempt || 0) + bucket.exempt).toFixed(2)),
        out_of_scope: Number(
          (Number(existing?.out_of_scope || 0) + bucket.out_of_scope).toFixed(2)
        ),
        source: "xero",
      };
    });

    const { error: upsertError } = await supabase
      .from("turnover_entries")
      .upsert(rowsToUpsert, {
        onConflict: "client_id,month_label,source",
      });

    if (upsertError) {
      return NextResponse.json(
        {
          error: "Could not save batch turnover",
          details: upsertError.message,
        },
        { status: 500 }
      );
    }

    const { data: latestRows } = await supabase
      .from("turnover_entries")
      .select("standard_rated,reduced_rated,zero_rated")
      .eq("client_id", clientId)
      .eq("source", "xero");

    const rollingTurnover = (latestRows || []).reduce(
      (sum, row) =>
        sum +
        Number(row.standard_rated || 0) +
        Number(row.reduced_rated || 0) +
        Number(row.zero_rated || 0),
      0
    );

    const thresholdPercent = (rollingTurnover / VAT_THRESHOLD) * 100;

    const riskStatus =
      rollingTurnover >= VAT_THRESHOLD
        ? "Registration Required"
        : rollingTurnover >= VAT_THRESHOLD * 0.9
        ? "High Risk"
        : rollingTurnover >= VAT_THRESHOLD * 0.8
        ? "Warning"
        : "Low Risk";

    await supabase.from("vat_reviews").insert({
      client_id: clientId,
      rolling_taxable_turnover: Number(rollingTurnover.toFixed(2)),
      expected_next_30_days: 0,
      risk_status: riskStatus,
      advice_note: `Batch import from Xero source: ${source}`,
    });

    let alertType: string | null = null;
    let alertMessage = "";

    if (thresholdPercent >= 100) {
      alertType = "BREACH";
      alertMessage = "VAT threshold exceeded – registration required immediately.";
    } else if (thresholdPercent >= 90) {
      alertType = "HIGH";
      alertMessage = "VAT turnover above 90% – urgent review required.";
    } else if (thresholdPercent >= 80) {
      alertType = "WARNING";
      alertMessage = "VAT turnover above 80% – monitor closely.";
    }

    if (alertType) {
      await supabase.from("vat_alerts").insert({
        client_id: clientId,
        threshold_percentage: Number(thresholdPercent.toFixed(2)),
        alert_type: alertType,
        message: alertMessage,
      });
    }

    const nextOffset = offset + limit;
    const done = nextOffset >= summaries.length;

    return NextResponse.json({
      message: "Xero batch import complete",
      clientId,
      clientName: client?.name || null,
      source,
      offset,
      limit,
      nextOffset: done ? null : nextOffset,
      done,
      totalAvailable: summaries.length,
      tokenWasRefreshed,
      recordsInThisBatch: batch.length,
      recordsImported,
      linesImported,
      recordsSkipped,
      rollingTurnover: Number(rollingTurnover.toFixed(2)),
      thresholdPercent: Number(thresholdPercent.toFixed(2)),
      riskStatus,
      alertType,
      importWindow: {
        fromDate: isoDate(fromDate),
        toDate: isoDate(toDate),
      },
      nextUrl: done
        ? null
        : `/api/xero/import?clientId=${clientId}&source=${source}&offset=${nextOffset}&limit=${limit}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unexpected batch import failure",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
