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
  if (match?.[1]) {
    return new Date(Number(match[1]));
  }

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

  if (value.includes("ZERO") || value.includes("ZERORATED")) {
    return "zero_rated";
  }

  if (value.includes("EXEMPT")) {
    return "exempt";
  }

  if (value.includes("REDUCED") || value.includes("OUTPUT5")) {
    return "reduced_rated";
  }

  if (value.includes("OUTOFSCOPE")) {
    return "out_of_scope";
  }

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

function addToBucket(
  bucket: MonthBucket,
  amount: number,
  taxType: string | undefined
) {
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

async function sendVatAlertEmail(params: {
  clientName: string;
  turnover: number;
  percent: number;
  alertType: string;
  message: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.VAT_ALERT_EMAIL_TO;
  const from =
    process.env.VAT_ALERT_EMAIL_FROM || "VAT Checker <onboarding@resend.dev>";

  if (!apiKey || !to) {
    return {
      sent: false,
      reason: "Missing Resend configuration",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: `VAT Alert - ${params.clientName}`,
      html: `
        <h2>VAT Threshold Alert</h2>
        <p><strong>Client:</strong> ${params.clientName}</p>
        <p><strong>Alert Type:</strong> ${params.alertType}</p>
        <p><strong>Rolling Taxable Turnover:</strong> £${params.turnover.toLocaleString()}</p>
        <p><strong>Threshold Used:</strong> ${params.percent.toFixed(1)}%</p>
        <p>${params.message}</p>
        <hr />
        <p style="font-size:12px;color:#666;">Generated automatically by VAT Checker.</p>
      `,
    }),
  });

  if (!response.ok) {
    return {
      sent: false,
      reason: await response.text(),
    };
  }

  return {
    sent: true,
    reason: "Email sent",
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId");

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

    const buckets = getLastCompleted12Months();
    const bucketMap = new Map<string, MonthBucket>();

    buckets.forEach((bucket) => {
      bucketMap.set(bucket.month_key, bucket);
    });

    let invoiceCount = 0;
    let invoiceLineCount = 0;
    let bankTransactionCount = 0;
    let bankLineCount = 0;
    let manualJournalCount = 0;
    let manualJournalLineCount = 0;
    let skippedBankTransfers = 0;

    const invoiceListResponse = await fetchWithRefresh(
      'https://api.xero.com/api.xro/2.0/Invoices?where=Type=="ACCREC"'
    );

    if (!invoiceListResponse.ok) {
      return NextResponse.json(
        {
          error: "Invoice list import failed",
          status: invoiceListResponse.status,
          details: await invoiceListResponse.text(),
        },
        { status: 400 }
      );
    }

    const invoiceListData = await invoiceListResponse.json();
    const invoiceSummaries: XeroInvoice[] = invoiceListData.Invoices || [];

    for (const invoiceSummary of invoiceSummaries) {
      if (!invoiceSummary.InvoiceID) continue;

      const detailResponse = await fetchWithRefresh(
        `https://api.xero.com/api.xro/2.0/Invoices/${invoiceSummary.InvoiceID}`
      );

      if (!detailResponse.ok) continue;

      const detailData = await detailResponse.json();
      const invoice: XeroInvoice | undefined = detailData.Invoices?.[0];

      if (!invoice) continue;
      if (invoice.Type !== "ACCREC") continue;
      if (invoice.Status === "VOIDED" || invoice.Status === "DELETED") continue;

      const invoiceDate = parseXeroDate(invoice.DateString || invoice.Date);
      if (!invoiceDate) continue;

      const bucket = bucketMap.get(monthKey(invoiceDate));
      if (!bucket) continue;

      for (const line of invoice.LineItems || []) {
        const amount = safeNumber(line.LineAmount);
        if (amount === 0) continue;

        addToBucket(bucket, amount, line.TaxType);
        invoiceLineCount += 1;
      }

      invoiceCount += 1;
    }

    const bankListResponse = await fetchWithRefresh(
      "https://api.xero.com/api.xro/2.0/BankTransactions"
    );

    if (!bankListResponse.ok) {
      return NextResponse.json(
        {
          error: "Bank transaction list import failed",
          status: bankListResponse.status,
          details: await bankListResponse.text(),
        },
        { status: 400 }
      );
    }

    const bankListData = await bankListResponse.json();
    const bankSummaries: XeroBankTransaction[] =
      bankListData.BankTransactions || [];

    const relevantBankSummaries = bankSummaries.filter((transaction) => {
      if (!transaction.BankTransactionID) return false;
      if (transaction.Type !== "RECEIVE") return false;
      if (transaction.Status === "VOIDED" || transaction.Status === "DELETED") {
        return false;
      }

      const transactionDate = parseXeroDate(
        transaction.DateString || transaction.Date
      );

      if (!transactionDate) return false;

      return bucketMap.has(monthKey(transactionDate));
    });

    for (const bankSummary of relevantBankSummaries) {
      if (!bankSummary.BankTransactionID) continue;

      const detailResponse = await fetchWithRefresh(
        `https://api.xero.com/api.xro/2.0/BankTransactions/${bankSummary.BankTransactionID}`
      );

      if (!detailResponse.ok) continue;

      const detailData = await detailResponse.json();
      const transaction: XeroBankTransaction | undefined =
        detailData.BankTransactions?.[0];

      if (!transaction) continue;
      if (transaction.Type !== "RECEIVE") continue;

      const transactionDate = parseXeroDate(
        transaction.DateString || transaction.Date
      );

      if (!transactionDate) continue;

      const bucket = bucketMap.get(monthKey(transactionDate));
      if (!bucket) continue;

      let countedThisTransaction = false;

      for (const line of transaction.LineItems || []) {
        if (!isRevenueAccount(line.AccountCode)) continue;

        const amount = safeNumber(line.LineAmount);
        if (amount === 0) continue;

        addToBucket(bucket, amount, line.TaxType);
        bankLineCount += 1;
        countedThisTransaction = true;
      }

      if (countedThisTransaction) {
        bankTransactionCount += 1;
      } else {
        skippedBankTransfers += 1;
      }
    }

    const manualJournalListResponse = await fetchWithRefresh(
      "https://api.xero.com/api.xro/2.0/ManualJournals"
    );

    if (!manualJournalListResponse.ok) {
      return NextResponse.json(
        {
          error: "Manual journal list import failed",
          status: manualJournalListResponse.status,
          details: await manualJournalListResponse.text(),
        },
        { status: 400 }
      );
    }

    const manualJournalListData = await manualJournalListResponse.json();
    const manualJournalSummaries: XeroManualJournal[] =
      manualJournalListData.ManualJournals || [];

    const relevantManualJournals = manualJournalSummaries.filter((journal) => {
      if (!journal.ManualJournalID) return false;
      if (journal.Status !== "POSTED") return false;

      const journalDate = parseXeroDate(journal.Date);
      if (!journalDate) return false;

      return bucketMap.has(monthKey(journalDate));
    });

    for (const journalSummary of relevantManualJournals) {
      if (!journalSummary.ManualJournalID) continue;

      const detailResponse = await fetchWithRefresh(
        `https://api.xero.com/api.xro/2.0/ManualJournals/${journalSummary.ManualJournalID}`
      );

      if (!detailResponse.ok) continue;

      const detailData = await detailResponse.json();
      const journal: XeroManualJournal | undefined =
        detailData.ManualJournals?.[0];

      if (!journal) continue;
      if (journal.Status !== "POSTED") continue;

      const journalDate = parseXeroDate(journal.Date);
      if (!journalDate) continue;

      const bucket = bucketMap.get(monthKey(journalDate));
      if (!bucket) continue;

      let countedThisJournal = false;

      for (const line of journal.JournalLines || []) {
        if (!isRevenueAccount(line.AccountCode)) continue;

        const amount = safeNumber(line.LineAmount);
        if (amount === 0) continue;

        addToBucket(bucket, amount, line.TaxType);
        manualJournalLineCount += 1;
        countedThisJournal = true;
      }

      if (countedThisJournal) {
        manualJournalCount += 1;
      }
    }

    const rollingTurnover = buckets.reduce(
      (sum, bucket) =>
        sum + bucket.standard_rated + bucket.reduced_rated + bucket.zero_rated,
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
          error: "Could not save imported turnover",
          details: turnoverInsertError.message,
        },
        { status: 500 }
      );
    }

    const { error: reviewInsertError } = await supabase
      .from("vat_reviews")
      .insert({
        client_id: clientId,
        rolling_taxable_turnover: Number(rollingTurnover.toFixed(2)),
        expected_next_30_days: 0,
        risk_status: riskStatus,
        advice_note:
          "Auto-imported from detailed Xero invoices, bank transactions and manual journals.",
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

    let alertType: string | null = null;
    let alertMessage = "";
    let emailResult: { sent: boolean; reason: string } | null = null;

    if (thresholdPercent >= 100) {
      alertType = "BREACH";
      alertMessage =
        "VAT threshold exceeded – registration required immediately.";
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

      emailResult = await sendVatAlertEmail({
        clientName: client?.name || "Unknown client",
        turnover: Number(rollingTurnover.toFixed(2)),
        percent: thresholdPercent,
        alertType,
        message: alertMessage,
      });
    }

    return NextResponse.json({
      message: "Detailed Xero revenue import complete",
      clientId,
      clientName: client?.name || null,
      tokenWasRefreshed,
      sourceCounts: {
        invoicesImported: invoiceCount,
        invoiceLinesImported: invoiceLineCount,
        bankTransactionsImported: bankTransactionCount,
        bankLinesImported: bankLineCount,
        bankReceiveTransactionsSkippedAsNonRevenue: skippedBankTransfers,
        manualJournalsImported: manualJournalCount,
        manualJournalLinesImported: manualJournalLineCount,
      },
      rollingTurnover: Number(rollingTurnover.toFixed(2)),
      thresholdPercent: Number(thresholdPercent.toFixed(2)),
      riskStatus,
      alertType,
      emailResult,
      months: turnoverRows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unexpected detailed import failure",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
