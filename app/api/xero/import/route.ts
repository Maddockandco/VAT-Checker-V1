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

type XeroReportCell = {
  Value?: string;
};

type XeroReportRow = {
  RowType?: string;
  Title?: string;
  Cells?: XeroReportCell[];
  Rows?: XeroReportRow[];
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

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getLastCompleted12Months(): Array<MonthBucket & { from_date: string; to_date: string }> {
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
      from_date: isoDate(startOfMonth(monthDate)),
      to_date: isoDate(endOfMonth(monthDate)),
      standard_rated: 0,
      reduced_rated: 0,
      zero_rated: 0,
      exempt: 0,
      out_of_scope: 0,
    };
  });
}

function parseAmount(value: string | undefined) {
  if (!value) return 0;

  const cleaned = value
    .replace(/,/g, "")
    .replace(/£/g, "")
    .replace(/\(/g, "-")
    .replace(/\)/g, "")
    .trim();

  const parsed = Number(cleaned);

  return Number.isFinite(parsed) ? parsed : 0;
}

function isRevenueSection(title: string | undefined) {
  const value = String(title || "").toLowerCase();

  return (
    value.includes("income") ||
    value.includes("revenue") ||
    value.includes("sales") ||
    value.includes("turnover")
  );
}

function extractRevenueFromRows(rows: XeroReportRow[] | undefined) {
  if (!rows) return 0;

  let total = 0;

  for (const row of rows) {
    if (row.RowType === "Section" && isRevenueSection(row.Title)) {
      for (const childRow of row.Rows || []) {
        if (childRow.RowType !== "Row") continue;

        const cells = childRow.Cells || [];

        for (let index = 1; index < cells.length; index += 1) {
          total += parseAmount(cells[index]?.Value);
        }
      }
    }

    if (row.Rows?.length) {
      total += extractRevenueFromRows(row.Rows);
    }
  }

  return total;
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
    return { sent: false, reason: "Missing Resend environment variables" };
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
      subject: `VAT alert: ${params.clientName} - ${params.alertType}`,
      html: `
        <h2>VAT threshold alert</h2>
        <p><strong>Client:</strong> ${params.clientName}</p>
        <p><strong>Alert:</strong> ${params.alertType}</p>
        <p><strong>Rolling taxable turnover:</strong> £${params.turnover.toLocaleString()}</p>
        <p><strong>Threshold used:</strong> ${params.percent.toFixed(1)}%</p>
        <p>${params.message}</p>
        <p style="color:#666;font-size:12px;">Generated by VAT Checker from Maddock & Co.</p>
      `,
    }),
  });

  if (!response.ok) {
    return { sent: false, reason: await response.text() };
  }

  return { sent: true, reason: "Email sent" };
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
      { error: "No Xero connection found", details: connectionError?.message },
      { status: 404 }
    );
  }

  let accessToken = connection.access_token;
  let refreshToken = connection.refresh_token;
  let tokenWasRefreshed = false;

  const buckets = getLastCompleted12Months();

  async function fetchProfitAndLossForMonth(bucket: MonthBucket & { from_date: string; to_date: string }) {
    const reportUrl = new URL(
      "https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss"
    );

    reportUrl.searchParams.set("fromDate", bucket.from_date);
    reportUrl.searchParams.set("toDate", bucket.to_date);
    reportUrl.searchParams.set("standardLayout", "true");
    reportUrl.searchParams.set("paymentsOnly", "false");

    return xeroFetch(
      reportUrl.toString(),
      accessToken,
      connection.provider_tenant_id
    );
  }

  for (const bucket of buckets) {
    let reportResponse = await fetchProfitAndLossForMonth(bucket);

    if (reportResponse.status === 401) {
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

      reportResponse = await fetchProfitAndLossForMonth(bucket);
    }

    if (!reportResponse.ok) {
      return NextResponse.json(
        {
          error: "Xero Profit & Loss report failed",
          month: bucket.month_label,
          status: reportResponse.status,
          details: await reportResponse.text(),
        },
        { status: 400 }
      );
    }

    const reportData = await reportResponse.json();
    const report = reportData.Reports?.[0];

    const revenue = extractRevenueFromRows(report?.Rows || []);

    bucket.standard_rated = Number(revenue.toFixed(2));
  }

  const rollingTurnover = buckets.reduce(
    (sum, bucket) =>
      sum + bucket.standard_rated + bucket.reduced_rated + bucket.zero_rated,
    0
  );

  const percent = (rollingTurnover / VAT_THRESHOLD) * 100;

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
        error: "Could not save Xero P&L turnover",
        details: turnoverInsertError.message,
      },
      { status: 500 }
    );
  }

  const { error: reviewInsertError } = await supabase.from("vat_reviews").insert({
    client_id: clientId,
    rolling_taxable_turnover: Number(rollingTurnover.toFixed(2)),
    expected_next_30_days: 0,
    risk_status: riskStatus,
    advice_note: "Auto-imported from Xero Profit & Loss revenue accounts.",
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

  if (percent >= 100) {
    alertType = "BREACH";
    alertMessage = "VAT threshold exceeded – registration required immediately.";
  } else if (percent >= 90) {
    alertType = "HIGH";
    alertMessage = "VAT turnover above 90% – urgent review required.";
  } else if (percent >= 80) {
    alertType = "WARNING";
    alertMessage = "VAT turnover above 80% – monitor closely.";
  }

  if (alertType) {
    await supabase.from("vat_alerts").insert({
      client_id: clientId,
      threshold_percentage: Number(percent.toFixed(2)),
      alert_type: alertType,
      message: alertMessage,
    });

    emailResult = await sendVatAlertEmail({
      clientName: client?.name || "Unknown client",
      turnover: Number(rollingTurnover.toFixed(2)),
      percent,
      alertType,
      message: alertMessage,
    });
  }

  return NextResponse.json({
    message: "Xero P&L revenue import complete",
    clientId,
    clientName: client?.name || null,
    tokenWasRefreshed,
    rollingTurnover: Number(rollingTurnover.toFixed(2)),
    thresholdPercent: Number(percent.toFixed(2)),
    riskStatus,
    alertType,
    emailResult,
    months: turnoverRows,
  });
}
