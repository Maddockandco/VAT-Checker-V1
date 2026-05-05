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

  // 🔑 KEY FIX HERE
  if (value === "NONE") {
    return "standard_rated";
  }

  if (value.includes("ZERO") || value.includes("ZERORATED")) {
    return "zero_rated";
  }

  if (value.includes("EXEMPT")) {
    return "exempt";
  }

  if (value.includes("REDUCED")) {
    return "reduced_rated";
  }

  return "standard_rated";
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: connection } = await supabase
    .from("accounting_connections")
    .select("*")
    .eq("client_id", clientId)
    .eq("provider", "xero")
    .single();

  let accessToken = connection.access_token;

  let listResponse = await xeroFetch(
    `https://api.xero.com/api.xro/2.0/Invoices?where=Type=="ACCREC"`,
    accessToken,
    connection.provider_tenant_id
  );

  if (listResponse.status === 401) {
    const refreshed = await refreshXeroToken(connection.refresh_token);

    accessToken = refreshed.access_token;

    await supabase
      .from("accounting_connections")
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
      })
      .eq("id", connection.id);

    listResponse = await xeroFetch(
      `https://api.xero.com/api.xro/2.0/Invoices?where=Type=="ACCREC"`,
      accessToken,
      connection.provider_tenant_id
    );
  }

  const data = await listResponse.json();
  const invoices: XeroInvoice[] = data.Invoices || [];

  const buckets = getLastCompleted12Months();
  const bucketMap = new Map<string, MonthBucket>();

  buckets.forEach((b) => bucketMap.set(b.month_key, b));

  for (const invoice of invoices) {
    if (!invoice.InvoiceID) continue;

    const detail = await xeroFetch(
      `https://api.xero.com/api.xro/2.0/Invoices/${invoice.InvoiceID}`,
      accessToken,
      connection.provider_tenant_id
    );

    const detailData = await detail.json();
    const inv = detailData.Invoices?.[0];

    const date = new Date(inv.DateString || inv.Date);
    const bucket = bucketMap.get(monthKey(date));

    if (!bucket) continue;

    for (const line of inv.LineItems || []) {
      const amount = Number(line.LineAmount || 0);
      const category = classifyTaxType(line.TaxType);

      bucket[category] += amount;
    }
  }

  const rolling = buckets.reduce(
    (sum, b) => sum + b.standard_rated + b.reduced_rated + b.zero_rated,
    0
  );

  await supabase.from("turnover_entries").delete().eq("client_id", clientId);

  await supabase.from("turnover_entries").insert(
    buckets.map((b) => ({
      client_id: clientId,
      ...b,
      source: "xero",
    }))
  );

  await supabase.from("vat_reviews").insert({
    client_id: clientId,
    rolling_taxable_turnover: rolling,
    risk_status:
      rolling >= VAT_THRESHOLD
        ? "Registration Required"
        : rolling >= VAT_THRESHOLD * 0.8
        ? "Warning"
        : "Low Risk",
    advice_note: "Auto-imported from Xero",
  });

  return NextResponse.json({
    message: "Xero VAT import complete",
    rollingTurnover: rolling,
  });
}
