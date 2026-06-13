// app/api/alerts/send/route.ts
// Sends VAT threshold alert emails via Resend
// Called automatically after each Xero import when threshold levels are breached

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FROM_EMAIL = "alerts@maddockandco.com";
const FIRM_NAME = "Maddock & Co. UK Ltd";
const FIRM_WEBSITE = "https://www.maddockandco.com";

function getRiskColour(status: string): string {
  switch (status) {
    case "Registration Required": return "#dc2626";
    case "High Risk": return "#ea580c";
    case "Warning": return "#ca8a04";
    case "Watch": return "#2563eb";
    default: return "#16a34a";
  }
}

function getRiskEmoji(status: string): string {
  switch (status) {
    case "Registration Required": return "🚨";
    case "High Risk": return "⚠️";
    case "Warning": return "⚠️";
    case "Watch": return "👀";
    default: return "✅";
  }
}

function buildEmailHtml(params: {
  recipientName: string;
  clientName: string;
  rollingTurnover: number;
  thresholdPercent: number;
  riskStatus: string;
  alertType: string;
  isAccountant: boolean;
  importPeriod: string;
}): string {
  const {
    recipientName,
    clientName,
    rollingTurnover,
    thresholdPercent,
    riskStatus,
    alertType,
    isAccountant,
    importPeriod,
  } = params;

  const riskColour = getRiskColour(riskStatus);
  const riskEmoji = getRiskEmoji(riskStatus);
  const remaining = Math.max(0, 90000 - rollingTurnover);
  const progressWidth = Math.min(Math.round(thresholdPercent), 100);

  const accountantNote = isAccountant
    ? `<p style="color:#374151;font-size:14px;line-height:1.6;">This is an automated alert from your VAT Registration Checker. Please review ${clientName}'s VAT position and take appropriate action.</p>`
    : `<p style="color:#374151;font-size:14px;line-height:1.6;">Your accountant at ${FIRM_NAME} has been notified and will be in touch. If you have any questions, please contact us directly.</p>`;

  const registrationWarning = alertType === "BREACH"
    ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:20px 0;">
        <p style="color:#991b1b;font-size:14px;font-weight:600;margin:0;">⚠️ Important: VAT Registration Required</p>
        <p style="color:#991b1b;font-size:13px;margin:8px 0 0 0;">The rolling 12-month taxable turnover has exceeded the £90,000 VAT registration threshold. Registration with HMRC may be required. Please seek professional advice immediately.</p>
       </div>`
    : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f2f7f8;font-family:'Open Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f7f8;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          
          <!-- Header -->
          <tr>
            <td style="background-color:#343b46;border-radius:12px 12px 0 0;padding:32px 40px;">
              <p style="color:#c9af69;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin:0 0 8px 0;">Maddock & Co.</p>
              <h1 style="color:#ffffff;font-size:24px;font-weight:700;margin:0;">VAT Threshold Alert</h1>
              <p style="color:#9ca3af;font-size:13px;margin:8px 0 0 0;">Automated VAT Registration Checker notification</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:32px 40px;">
              
              <p style="color:#374151;font-size:15px;margin:0 0 20px 0;">Dear ${recipientName},</p>
              
              <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 24px 0;">
                Our VAT monitoring system has detected that <strong>${clientName}</strong> has reached a new VAT threshold level that requires your attention.
              </p>

              <!-- Risk Badge -->
              <div style="text-align:center;margin:24px 0;">
                <span style="background-color:${riskColour};color:#ffffff;font-size:16px;font-weight:700;padding:10px 24px;border-radius:24px;display:inline-block;">
                  ${riskEmoji} ${riskStatus}
                </span>
              </div>

              ${registrationWarning}

              <!-- Stats -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td style="background-color:#f2f7f8;border-radius:8px;padding:20px;width:48%;">
                    <p style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px 0;">Rolling 12-month turnover</p>
                    <p style="color:#343b46;font-size:22px;font-weight:700;margin:0;">£${rollingTurnover.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </td>
                  <td width="4%"></td>
                  <td style="background-color:#f2f7f8;border-radius:8px;padding:20px;width:48%;">
                    <p style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px 0;">Remaining to threshold</p>
                    <p style="color:#343b46;font-size:22px;font-weight:700;margin:0;">£${remaining.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </td>
                </tr>
              </table>

              <!-- Progress bar -->
              <p style="color:#6b7280;font-size:12px;margin:0 0 6px 0;">VAT Registration Threshold (£90,000)</p>
              <div style="background-color:#e5e7eb;border-radius:8px;height:12px;width:100%;margin-bottom:6px;">
                <div style="background-color:${riskColour};border-radius:8px;height:12px;width:${progressWidth}%;"></div>
              </div>
              <p style="color:${riskColour};font-size:13px;font-weight:700;margin:0 0 24px 0;">${thresholdPercent.toFixed(1)}% of threshold used</p>

              <!-- Import period -->
              <p style="color:#6b7280;font-size:12px;margin:0 0 24px 0;">Based on data for the period: <strong>${importPeriod}</strong></p>

              ${accountantNote}

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#343b46;border-radius:0 0 12px 12px;padding:24px 40px;">
              <p style="color:#9ca3af;font-size:12px;margin:0 0 4px 0;">${FIRM_NAME}</p>
              <p style="color:#9ca3af;font-size:12px;margin:0 0 4px 0;">VAT Registration Checker — Automated Alert</p>
              <p style="color:#c9af69;font-size:12px;margin:0;">
                <a href="${FIRM_WEBSITE}" style="color:#c9af69;text-decoration:none;">${FIRM_WEBSITE}</a>
              </p>
              <p style="color:#6b7280;font-size:11px;margin:12px 0 0 0;">
                This is an automated notification. Please do not reply to this email. 
                This alert is for monitoring purposes only and does not constitute professional advice.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function POST(request: Request) {
  try {
    const { clientId } = await request.json();

    if (!clientId) {
      return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return NextResponse.json({ error: "Missing RESEND_API_KEY" }, { status: 500 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get client details including email
    const { data: client } = await supabase
      .from("clients")
      .select("id,name,email,contact_name,firm_id")
      .eq("id", clientId)
      .single();

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Get latest VAT review for this client
    const { data: review } = await supabase
      .from("vat_reviews")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!review) {
      return NextResponse.json({ error: "No VAT review found" }, { status: 404 });
    }

    // Only send alerts for Watch level and above
    const alertStatuses = ["Watch", "Warning", "High Risk", "Registration Required"];
    if (!alertStatuses.includes(review.risk_status)) {
      return NextResponse.json({ ok: true, message: "No alert needed — risk status is Low Risk" });
    }

    // Determine alert type
    const thresholdPercent = (review.rolling_taxable_turnover / 90000) * 100;
    const alertType =
      thresholdPercent >= 100 ? "BREACH"
      : thresholdPercent >= 90 ? "HIGH"
      : thresholdPercent >= 80 ? "WARNING"
      : "WATCH";

    // Get accountant email via firm
    let accountantEmail: string | null = null;
    let accountantName = FIRM_NAME;

    if (client.firm_id) {
      const { data: firmAccess } = await supabase
        .from("firm_user_access")
        .select("user_id")
        .eq("firm_id", client.firm_id)
        .limit(1)
        .single();

      if (firmAccess) {
        const { data: accountantProfile } = await supabase
          .from("user_profiles")
          .select("email,full_name")
          .eq("id", firmAccess.user_id)
          .single();

        if (accountantProfile) {
          accountantEmail = accountantProfile.email;
          accountantName = accountantProfile.full_name || FIRM_NAME;
        }
      }
    }

    // Build import period string
    const today = new Date();
    const endMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const startMonth = new Date(endMonth.getFullYear(), endMonth.getMonth() - 11, 1);
    const importPeriod = `${startMonth.toLocaleString("en-GB", { month: "short", year: "numeric" })} – ${endMonth.toLocaleString("en-GB", { month: "short", year: "numeric" })}`;

    const emailsSent: string[] = [];
    const emailsFailed: string[] = [];

    // Send to accountant
    if (accountantEmail) {
      const html = buildEmailHtml({
        recipientName: accountantName,
        clientName: client.name,
        rollingTurnover: review.rolling_taxable_turnover,
        thresholdPercent,
        riskStatus: review.risk_status,
        alertType,
        isAccountant: true,
        importPeriod,
      });

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${FIRM_NAME} <${FROM_EMAIL}>`,
          to: [accountantEmail],
          subject: `${getRiskEmoji(review.risk_status)} VAT Alert — ${client.name} is at ${thresholdPercent.toFixed(1)}% of threshold`,
          html,
        }),
      });

      if (res.ok) {
        emailsSent.push(accountantEmail);
      } else {
        const err = await res.json();
        emailsFailed.push(`${accountantEmail}: ${err.message || "Unknown error"}`);
      }
    }

    // Send to client if they have an email
    if (client.email) {
      const html = buildEmailHtml({
        recipientName: client.contact_name || client.name,
        clientName: client.name,
        rollingTurnover: review.rolling_taxable_turnover,
        thresholdPercent,
        riskStatus: review.risk_status,
        alertType,
        isAccountant: false,
        importPeriod,
      });

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${FIRM_NAME} <${FROM_EMAIL}>`,
          to: [client.email],
          subject: `${getRiskEmoji(review.risk_status)} VAT Threshold Alert — Action May Be Required`,
          html,
        }),
      });

      if (res.ok) {
        emailsSent.push(client.email);
      } else {
        const err = await res.json();
        emailsFailed.push(`${client.email}: ${err.message || "Unknown error"}`);
      }
    }

    // Record alert in database
    await supabase.from("vat_alerts").insert({
      client_id: clientId,
      threshold_percentage: Number(thresholdPercent.toFixed(2)),
      alert_type: alertType,
      message: `Email alert sent to: ${emailsSent.join(", ") || "no recipients"}`,
    });

    return NextResponse.json({
      ok: true,
      alertType,
      riskStatus: review.risk_status,
      thresholdPercent: Number(thresholdPercent.toFixed(2)),
      emailsSent,
      emailsFailed,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Unexpected error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
