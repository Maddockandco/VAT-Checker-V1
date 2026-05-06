import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type XeroLineItem = {
  Description?: string;
  LineAmount?: number;
  TaxType?: string;
  TaxAmount?: number;
  AccountCode?: string;
};

type XeroInvoice = {
  InvoiceID?: string;
  InvoiceNumber?: string;
  Type?: string;
  Status?: string;
  DateString?: string;
  Date?: string;
  Total?: number;
  TotalTax?: number;
  LineItems?: XeroLineItem[];
};

type XeroBankTransaction = {
  BankTransactionID?: string;
  Type?: string;
  Status?: string;
  DateString?: string;
  Date?: string;
  Total?: number;
  TotalTax?: number;
  Contact?: {
    Name?: string;
  };
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

function summariseLineItems(lineItems: XeroLineItem[] | undefined) {
  return (lineItems || []).slice(0, 10).map((line) => ({
    description: line.Description || null,
    lineAmount: line.LineAmount ?? null,
    accountCode: line.AccountCode || null,
    taxType: line.TaxType || null,
    taxAmount: line.TaxAmount ?? null,
  }));
}

function summariseJournalLines(lines: XeroManualJournalLine[] | undefined) {
  return (lines || []).slice(0, 10).map((line) => ({
    description: line.Description || null,
    lineAmount: line.LineAmount ?? null,
    accountCode: line.AccountCode || null,
    taxType: line.TaxType || null,
  }));
}

export async function GET(request: Request) {
  try {
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

    const invoiceUrl =
      'https://api.xero.com/api.xro/2.0/Invoices?where=Type=="ACCREC"';

    const bankTransactionUrl =
      "https://api.xero.com/api.xro/2.0/BankTransactions";

    const manualJournalUrl =
      "https://api.xero.com/api.xro/2.0/ManualJournals";

    const [invoiceResponse, bankResponse, journalResponse] = await Promise.all([
      fetchWithRefresh(invoiceUrl),
      fetchWithRefresh(bankTransactionUrl),
      fetchWithRefresh(manualJournalUrl),
    ]);

    const invoiceText = invoiceResponse.ok ? "" : await invoiceResponse.text();
    const bankText = bankResponse.ok ? "" : await bankResponse.text();
    const journalText = journalResponse.ok ? "" : await journalResponse.text();

    const invoiceData = invoiceResponse.ok ? await invoiceResponse.json() : {};
    const bankData = bankResponse.ok ? await bankResponse.json() : {};
    const journalData = journalResponse.ok ? await journalResponse.json() : {};

    const invoices: XeroInvoice[] = invoiceData.Invoices || [];
    const bankTransactions: XeroBankTransaction[] =
      bankData.BankTransactions || [];
    const manualJournals: XeroManualJournal[] =
      journalData.ManualJournals || [];

    const invoiceAccountCodes: Record<string, number> = {};
    const invoiceTaxTypes: Record<string, number> = {};
    const bankAccountCodes: Record<string, number> = {};
    const bankTaxTypes: Record<string, number> = {};
    const journalAccountCodes: Record<string, number> = {};
    const journalTaxTypes: Record<string, number> = {};

    for (const invoice of invoices) {
      for (const line of invoice.LineItems || []) {
        const accountCode = line.AccountCode || "NO_ACCOUNT_CODE";
        const taxType = line.TaxType || "NO_TAX_TYPE";
        invoiceAccountCodes[accountCode] =
          (invoiceAccountCodes[accountCode] || 0) + Number(line.LineAmount || 0);
        invoiceTaxTypes[taxType] =
          (invoiceTaxTypes[taxType] || 0) + Number(line.LineAmount || 0);
      }
    }

    for (const transaction of bankTransactions) {
      for (const line of transaction.LineItems || []) {
        const accountCode = line.AccountCode || "NO_ACCOUNT_CODE";
        const taxType = line.TaxType || "NO_TAX_TYPE";
        bankAccountCodes[accountCode] =
          (bankAccountCodes[accountCode] || 0) + Number(line.LineAmount || 0);
        bankTaxTypes[taxType] =
          (bankTaxTypes[taxType] || 0) + Number(line.LineAmount || 0);
      }
    }

    for (const journal of manualJournals) {
      for (const line of journal.JournalLines || []) {
        const accountCode = line.AccountCode || "NO_ACCOUNT_CODE";
        const taxType = line.TaxType || "NO_TAX_TYPE";
        journalAccountCodes[accountCode] =
          (journalAccountCodes[accountCode] || 0) + Number(line.LineAmount || 0);
        journalTaxTypes[taxType] =
          (journalTaxTypes[taxType] || 0) + Number(line.LineAmount || 0);
      }
    }

    return NextResponse.json({
      message: "Xero revenue source debug complete",
      clientId,
      tokenWasRefreshed,
      endpointStatus: {
        invoices: {
          ok: invoiceResponse.ok,
          status: invoiceResponse.status,
          error: invoiceText || null,
        },
        bankTransactions: {
          ok: bankResponse.ok,
          status: bankResponse.status,
          error: bankText || null,
        },
        manualJournals: {
          ok: journalResponse.ok,
          status: journalResponse.status,
          error: journalText || null,
        },
      },
      counts: {
        invoices: invoices.length,
        bankTransactions: bankTransactions.length,
        manualJournals: manualJournals.length,
      },
      totalsByAccountCode: {
        invoices: invoiceAccountCodes,
        bankTransactions: bankAccountCodes,
        manualJournals: journalAccountCodes,
      },
      totalsByTaxType: {
        invoices: invoiceTaxTypes,
        bankTransactions: bankTaxTypes,
        manualJournals: journalTaxTypes,
      },
      samples: {
        invoices: invoices.slice(0, 5).map((invoice) => ({
          invoiceId: invoice.InvoiceID,
          invoiceNumber: invoice.InvoiceNumber,
          type: invoice.Type,
          status: invoice.Status,
          date: invoice.DateString || invoice.Date,
          total: invoice.Total,
          totalTax: invoice.TotalTax,
          lineItems: summariseLineItems(invoice.LineItems),
        })),
        bankTransactions: bankTransactions.slice(0, 10).map((transaction) => ({
          bankTransactionId: transaction.BankTransactionID,
          type: transaction.Type,
          status: transaction.Status,
          date: transaction.DateString || transaction.Date,
          contactName: transaction.Contact?.Name || null,
          total: transaction.Total,
          totalTax: transaction.TotalTax,
          lineItems: summariseLineItems(transaction.LineItems),
        })),
        manualJournals: manualJournals.slice(0, 10).map((journal) => ({
          manualJournalId: journal.ManualJournalID,
          narration: journal.Narration,
          date: journal.Date,
          status: journal.Status,
          journalLines: summariseJournalLines(journal.JournalLines),
        })),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unexpected debug import failure",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
