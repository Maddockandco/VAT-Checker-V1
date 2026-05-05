import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const VAT_THRESHOLD = 90000;

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
  LineAmount?: number;
  TaxType?: string;
};

type XeroInvoice = {
  InvoiceID?: string;
  Type?: string;
  Status?: string;
  DateString?: string;
  Date?: string;
  LineItems?: XeroLineItem[];
};

function formatMonthLabel(date: Date) {
  return date.toLocaleString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getLastCompleted12Months(): MonthBucket[] {
  const today = new Date();
  const endMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

  return Array.from({ length: 12 }, (_, index) => {
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
}

function classifyTaxType(taxType: string | undefined): VatCategory {
  const value = String(taxType || "").toUpperCase();

  if (value.includes("ZERO") || value.includes("ZERORATED") || value.includes("OUTPUT0")) {
    return "zero_rated";
  }

  if (value.includes("EXEMPT") || value.includes("EXEMPTOUTPUT")) {
    return "exempt";
  }

  if (value.includes("NONE") || value.includes("NOTAX") || value.includes("OUTOFSCOPE")) {
    return "out_of_scope";
  }

  if (value.includes("REDUCED") || value.includes("OUTPUT5")) {
    return "reduced_rated";
  }

  return "standard_rated";
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
    const details = await response.text();
    throw new Error(`Xero token refresh failed: ${details}`);
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId");

  if (!clientId) {
    return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Missing Supabase server environment variables" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

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
      { error: "No Xero connection found", details: connectionError?.message },
      { status: 404 }
    );
  }

  let accessToken = connection.access_token;
  let refreshToken = connection.refresh_token;
  let tokenWasRefreshed = false;

  const listUrl = new URL("https://api.xero.com/api.xro/2.0/Invoices");
  listUrl.searchParams.set("where", 'Type=="ACCREC"');

  let listResponse = await xeroFetch(
    listUrl.toString(),
    accessToken,
    connection.provider_tenant_id
  );

  if (listResponse.status === 401) {
    try {
      const refreshedToken = await refreshXeroToken(refreshToken);

      accessToken = refreshedToken.access_token;
      refreshToken = refreshedToken.refresh_token;
      tokenWasRefreshed = true;

      await supabase
        .from("accounting_connections")
        .update({
          access_token: refreshedToken.access_token,
          refresh_token: refreshedToken.refresh_token,
          token_expires_at: new Date(
            Date.now() + Number(refreshedToken.expires_in || 0) * 1000
          ).toISOString(),
        })
        .eq("id", connection.id);

      listResponse = await xeroFetch(
        listUrl.toString(),
        accessToken,
        connection.provider_tenant_id
      );
    } catch (error) {
      return NextResponse.json(
        {
          error: "Could not refresh Xero token",
          details: error instanceof Error ? error.message : String(error),
        },
        { status: 401 }
      );
    }
  }

  if (!listResponse.ok) {
    return NextResponse.json(
      {
        error: "Xero invoice list failed",
        status: listResponse.status,
        details: await listResponse.text(),
      },
      { status: 400 }
    );
  }

  const listData = await listResponse.json();
  const summaryInvoices: XeroInvoice[] = listData.Invoices || [];

  const buckets = getLastCompleted12Months();
  const bucketMap = new Map<string, MonthBucket>();

  for (const bucket of buckets) {
    bucketMap.set(bucket.month_key, bucket);
  }

  let invoiceCount = 0;
  let importedLineCount = 0;
  let skippedInvoiceCount = 0;

  for (const summaryInvoice of summaryInvoices) {
    if (!summaryInvoice.InvoiceID) {
      skippedInvoiceCount += 1;
      continue;
    }

    const detailUrl = `https://api.xero.com/api.xro/2.0/Invoices/${summaryInvoice.InvoiceID}`;
    const detailResponse = await xeroFetch(
      detailUrl,
      accessToken,
      connection.provider_tenant_id
    );

    if (!detailResponse.ok) {
      skippedInvoiceCount += 1;
      continue;
    }

    const detailData = await detailResponse.json();
    const invoice: XeroInvoice | undefined = detailData.Invoices?.[0];

    if (!invoice) {
      skippedInvoiceCount += 1;
      continue;
    }

    if (invoice.Type !== "ACCREC") continue;
    if (invoice.Status === "VOIDED" || invoice.Status === "DELETED") continue;

    const invoiceDateValue = invoice.DateString || invoice.Date;
    if (!invoiceDateValue) continue;

    const invoiceDate = new Date(invoiceDateValue);
    const key = monthKey(invoiceDate);
    const bucket = bucketMap.get(key);

    if (!bucket) continue;

    invoiceCount += 1;

    for (const line of invoice.LineItems || []) {
      const amount = Number(line.LineAmount || 0);
      const category = classifyTaxType(line.TaxType);

      bucket[category] += amount;
      importedLineCount += 1;
    }
  }

  const rollingTaxableTurnover = buckets.reduce(
    (sum, bucket) =>
      sum +
      bucket.standard_rated +
      bucket.reduced_rated +
      bucket.zero_rated,
    0
  );

  const riskStatus =
    rollingTaxableTurnover >= VAT_THRESHOLD
      ? "Registration Required"
      : rollingTaxableTurnover >= VAT_THRESHOLD * 0.9
      ? "High Risk"
      : rollingTaxableTurnover >= VAT_THRESHOLD * 0.8
      ? "Warning"
      : "Low Risk";

  await supabase
    .from("turnover_entries")
    .delete()
    .eq("client_id", clientId)
    .eq("source", "xero");

  const turnoverRows = buckets.map((bucket) => ({
    client_id: clientId,
    month_label: bucket.month_label,
    standard_rated: Number(bucket.standard_rated.toFixed(2)),
    reduced_rated: Number(bucket.reduced_rated.toFixed(2)),
    zero_rated: Number(bucket.zero_rated.toFixed(2)),
    exempt: Number(bucket.exempt.toFixed(2)),
    out_of_scope: Number(bucket.out_of_scope.toFixed(2)),
    source: "xero",
  }));

  const { error: turnoverInsertError } = await supabase
    .from("turnover_entries")
    .insert(turnoverRows);

  if (turnoverInsertError) {
    return NextResponse.json(
      {
        error: "Could not save imported Xero turnover",
        details: turnoverInsertError.message,
      },
      { status: 500 }
    );
  }

  const { error: reviewInsertError } = await supabase
    .from("vat_reviews")
    .insert({
      client_id: clientId,
      rolling_taxable_turnover: Number(rollingTaxableTurnover.toFixed(2)),
      expected_next_30_days: 0,
      risk_status: riskStatus,
      advice_note: "Imported from Xero invoice line items.",
    });

  if (reviewInsertError) {
    return NextResponse.json(
      {
        error: "Could not save VAT review",
        details: reviewInsertError.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: "Xero full invoice detail import completed",
    clientId,
    tokenWasRefreshed,
    summaryInvoiceCount: summaryInvoices.length,
    invoiceCount,
    skippedInvoiceCount,
    importedLineCount,
    rollingTaxableTurnover: Number(rollingTaxableTurnover.toFixed(2)),
    riskStatus,
    months: turnoverRows,
  });
}
