import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type XeroLineItem = {
  Description?: string;
  LineAmount?: number;
  TaxType?: string;
  TaxAmount?: number;
};

type XeroInvoice = {
  InvoiceID?: string;
  InvoiceNumber?: string;
  Type?: string;
  Status?: string;
  DateString?: string;
  Date?: string;
  LineItems?: XeroLineItem[];
};

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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: connection, error: connectionError } = await supabase
    .from("accounting_connections")
    .select("*")
    .eq("client_id", clientId)
    .eq("provider", "xero")
    .order("connected_at", { ascending: false })
    .limit(1)
    .single();

  if (connectionError || !connection) {
    return NextResponse.json({
      error: "No Xero connection found",
      details: connectionError?.message,
    });
  }

  const listUrl = new URL("https://api.xero.com/api.xro/2.0/Invoices");
  listUrl.searchParams.set("where", 'Type=="ACCREC"');

  const listResponse = await xeroFetch(
    listUrl.toString(),
    connection.access_token,
    connection.provider_tenant_id
  );

  if (!listResponse.ok) {
    return NextResponse.json({
      error: "Invoice list failed",
      status: listResponse.status,
      details: await listResponse.text(),
    });
  }

  const listData = await listResponse.json();
  const summaryInvoices: XeroInvoice[] = listData.Invoices || [];

  const taxSamples: any[] = [];
  const taxTotals: Record<string, number> = {};

  for (const summaryInvoice of summaryInvoices.slice(0, 20)) {
    if (!summaryInvoice.InvoiceID) continue;

    const detailUrl = `https://api.xero.com/api.xro/2.0/Invoices/${summaryInvoice.InvoiceID}`;

    const detailResponse = await xeroFetch(
      detailUrl,
      connection.access_token,
      connection.provider_tenant_id
    );

    if (!detailResponse.ok) continue;

    const detailData = await detailResponse.json();
    const invoice: XeroInvoice | undefined = detailData.Invoices?.[0];

    if (!invoice?.LineItems) continue;

    for (const line of invoice.LineItems) {
      const taxType = line.TaxType || "NO_TAX_TYPE";
      const amount = Number(line.LineAmount || 0);

      taxTotals[taxType] = Number(((taxTotals[taxType] || 0) + amount).toFixed(2));

      taxSamples.push({
        invoiceNumber: invoice.InvoiceNumber,
        invoiceDate: invoice.DateString || invoice.Date,
        invoiceStatus: invoice.Status,
        description: line.Description,
        lineAmount: line.LineAmount,
        taxType: line.TaxType,
        taxAmount: line.TaxAmount,
      });
    }
  }

  return NextResponse.json({
    message: "Xero tax debug complete",
    summaryInvoiceCount: summaryInvoices.length,
    sampledLineCount: taxSamples.length,
    taxTotals,
    samples: taxSamples.slice(0, 30),
  });
}
