import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const VAT_THRESHOLD = 90000;

type MonthBucket = {
  month_label: string;
  month_key: string;
  standard_rated: number;
  reduced_rated: number;
  zero_rated: number;
  exempt: number;
  out_of_scope: number;
};

type XeroInvoice = {
  Type?: string;
  Status?: string;
  DateString?: string;
  Date?: string;
  Total?: number;
  TotalTax?: number;
};

type XeroBankTransaction = {
  Type?: string;
  Status?: string;
  DateString?: string;
  Date?: string;
  Total?: number;
  TotalTax?: number;
};

type XeroManualJournal = {
  Date?: string;
  Status?: string;
  JournalLines?: {
    NetAmount?: number;
    AccountCode?: string;
  }[];
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

function safeNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRevenueAccount(accountCode: string | undefined) {
  if (!accountCode) return false;

  const code = Number(accountCode);

  return code >= 200 && code < 999;
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
    process.env.VAT_ALERT_EMAIL_FROM ||
    "VAT Checker <onboarding@resend.dev>";

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

        <p><strong>Rolling Taxable Turnover:</strong>
        £${params.turnover.toLocaleString()}</p>

        <p><strong>Threshold Used:</strong>
        ${params.percent.toFixed(1)}%</p>

        <p>${params.message}</p>

        <hr />

        <p style="font-size:12px;color:#666;">
        Generated automatically by VAT Checker.
        </p>
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
      return NextResponse.json(
        { error: "Missing clientId" },
        { status: 400 }
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

    async function fetchWithRefresh(url: string) {
      let response = await xeroFetch(
        url,
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
          url,
          accessToken,
          connection.provider_tenant_id
        );
      }

      return response;
    }

    const invoiceResponse = await fetchWithRefresh(
      "https://api.xero.com/api.xro/2.0/Invoices?where=Type==\"ACCREC\""
    );

    const bankResponse = await fetchWithRefresh(
      "https://api.xero.com/api.xro/2.0/BankTransactions"
    );

    const journalResponse = await fetchWithRefresh(
      "https://api.xero.com/api.xro/2.0/ManualJournals"
    );

    if (!invoiceResponse.ok) {
      return NextResponse.json(
        {
          error: "Invoice import failed",
          status: invoiceResponse.status,
          details: await invoiceResponse.text(),
        },
        { status: 400 }
      );
    }

    if (!bankResponse.ok) {
      return NextResponse.json(
        {
          error: "Bank transaction import failed",
          status: bankResponse.status,
          details: await bankResponse.text(),
        },
        { status: 400 }
      );
    }

    if (!journalResponse.ok) {
      return NextResponse.json(
        {
          error: "Manual journal import failed",
          status: journalResponse.status,
          details: await journalResponse.text(),
        },
        { status: 400 }
      );
    }

    const invoiceData = await invoiceResponse.json();
    const bankData = await bankResponse.json();
    const journalData = await journalResponse.json();

    const invoices: XeroInvoice[] = invoiceData.Invoices || [];
    const bankTransactions: XeroBankTransaction[] =
      bankData.BankTransactions || [];
    const journals: XeroManualJournal[] =
      journalData.ManualJournals || [];

    const buckets = getLastCompleted12Months();
    const bucketMap = new Map<string, MonthBucket>();

    buckets.forEach((bucket) => {
      bucketMap.set(bucket.month_key, bucket);
    });

    let invoiceCount = 0;
    let bankTransactionCount = 0;
    let journalCount = 0;

    for (const invoice of invoices) {
      if (
        invoice.Status === "VOIDED" ||
        invoice.Status === "DELETED"
      ) {
        continue;
      }

      const date = new Date(
        invoice.DateString || invoice.Date || ""
      );

      const bucket = bucketMap.get(monthKey(date));

      if (!bucket) continue;

      const total = safeNumber(invoice.Total);
      const tax = safeNumber(invoice.TotalTax);

      bucket.standard_rated += total - tax;

      invoiceCount += 1;
    }

    for (const transaction of bankTransactions) {
      if (
        transaction.Status === "VOIDED" ||
        transaction.Status === "DELETED"
      ) {
        continue;
      }

      if (transaction.Type !== "RECEIVE") {
        continue;
      }

      const date = new Date(
        transaction.DateString || transaction.Date || ""
      );

      const bucket = bucketMap.get(monthKey(date));

      if (!bucket) continue;

      const total = safeNumber(transaction.Total);
      const tax = safeNumber(transaction.TotalTax);

      bucket.standard_rated += total - tax;

      bankTransactionCount += 1;
    }

    for (const journal of journals) {
      if (journal.Status !== "POSTED") continue;

      const date = new Date(journal.Date || "");

      const bucket = bucketMap.get(monthKey(date));

      if (!bucket) continue;

      for (const line of journal.JournalLines || []) {
        if (!isRevenueAccount(line.AccountCode)) continue;

        const amount = safeNumber(line.NetAmount);

        if (amount > 0) {
          bucket.standard_rated += amount;
        }
      }

      journalCount += 1;
    }

    const rollingTurnover = buckets.reduce(
      (sum, bucket) =>
        sum +
        bucket.standard_rated +
        bucket.reduced_rated +
        bucket.zero_rated,
      0
    );

    const thresholdPercent =
      (rollingTurnover / VAT_THRESHOLD) * 100;

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
      standard_rated: Number(
        bucket.standard_rated.toFixed(2)
      ),
      reduced_rated: Number(
        bucket.reduced_rated.toFixed(2)
      ),
      zero_rated: Number(bucket.zero_rated.toFixed(2)),
      exempt: Number(bucket.exempt.toFixed(2)),
      out_of_scope: Number(
        bucket.out_of_scope.toFixed(2)
      ),
      source: "xero",
    }));

    await supabase
      .from("turnover_entries")
      .insert(turnoverRows);

    await supabase.from("vat_reviews").insert({
      client_id: clientId,
      rolling_taxable_turnover: Number(
        rollingTurnover.toFixed(2)
      ),
      expected_next_30_days: 0,
      risk_status: riskStatus,
      advice_note:
        "Auto-imported using invoices, bank transactions and journals.",
    });

    let alertType: string | null = null;
    let alertMessage = "";
    let emailResult = null;

    if (thresholdPercent >= 100) {
      alertType = "BREACH";
      alertMessage =
        "VAT threshold exceeded – registration required immediately.";
    } else if (thresholdPercent >= 90) {
      alertType = "HIGH";
      alertMessage =
        "VAT turnover above 90% – urgent review required.";
    } else if (thresholdPercent >= 80) {
      alertType = "WARNING";
      alertMessage =
        "VAT turnover above 80% – monitor closely.";
    }

    if (alertType) {
      await supabase.from("vat_alerts").insert({
        client_id: clientId,
        threshold_percentage: Number(
          thresholdPercent.toFixed(2)
        ),
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
      message: "Unified Xero revenue import complete",
      clientId,
      clientName: client?.name || null,
      tokenWasRefreshed,
      invoiceCount,
      bankTransactionCount,
      journalCount,
      rollingTurnover: Number(
        rollingTurnover.toFixed(2)
      ),
      thresholdPercent: Number(
        thresholdPercent.toFixed(2)
      ),
      riskStatus,
      alertType,
      emailResult,
      months: turnoverRows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unexpected import failure",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 }
    );
  }
}
