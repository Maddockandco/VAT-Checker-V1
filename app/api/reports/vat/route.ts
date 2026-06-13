// app/api/reports/vat/route.ts
// Generates a branded HTML VAT threshold report
// Designed to be printed to PDF via browser print function
// Supports white-label branding per firm with their own logo

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getRiskColour(status: string): string {
  switch (status) {
    case "Registration Required": return "#dc2626";
    case "High Risk": return "#ea580c";
    case "Warning": return "#ca8a04";
    case "Watch": return "#2563eb";
    default: return "#16a34a";
  }
}

function getRiskBg(status: string): string {
  switch (status) {
    case "Registration Required": return "#fef2f2";
    case "High Risk": return "#fff7ed";
    case "Warning": return "#fefce8";
    case "Watch": return "#eff6ff";
    default: return "#f0fdf4";
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId");

    if (!clientId) {
      return new NextResponse("Missing clientId", { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get client details
    const { data: client } = await supabase
      .from("clients")
      .select("id,name,sector,firm_id,email,contact_name")
      .eq("id", clientId)
      .single();

    if (!client) {
      return new NextResponse("Client not found", { status: 404 });
    }

    // Get firm details for white-label branding
    const { data: firm } = await supabase
      .from("firms")
      .select("id,name,logo_url,primary_colour,website,phone,address")
      .eq("id", client.firm_id)
      .single();

    // Get latest VAT review
    const { data: review } = await supabase
      .from("vat_reviews")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Get turnover entries
    const { data: entries } = await supabase
      .from("turnover_entries")
      .select("month_label,standard_rated,reduced_rated,zero_rated,exempt,out_of_scope,source")
      .eq("client_id", clientId)
      .eq("source", "xero")
      .order("month_label", { ascending: true });

    const VAT_THRESHOLD = 90000;
    const rollingTurnover = Number(review?.rolling_taxable_turnover || 0);
    const thresholdPercent = (rollingTurnover / VAT_THRESHOLD) * 100;
    const remaining = Math.max(0, VAT_THRESHOLD - rollingTurnover);
    const riskStatus = review?.risk_status || "No review";
    const progressWidth = Math.min(Math.round(thresholdPercent), 100);

    // Next review date — 3 months from today
    const nextReview = new Date();
    nextReview.setMonth(nextReview.getMonth() + 3);
    const nextReviewStr = nextReview.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

    // Report date
    const reportDate = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

    // Firm branding
    const firmName = firm?.name || "Your Accounting Firm";
    const firmColour = firm?.primary_colour || "#343b46";
    const firmLogo = firm?.logo_url || null;
    const firmWebsite = firm?.website || "";
    const firmPhone = firm?.phone || "";
    const firmAddress = firm?.address || "";

    // Build monthly table rows
    const monthRows = (entries || []).map((entry) => {
      const standard = Number(entry.standard_rated || 0);
      const reduced = Number(entry.reduced_rated || 0);
      const zero = Number(entry.zero_rated || 0);
      const exempt = Number(entry.exempt || 0);
      const outOfScope = Number(entry.out_of_scope || 0);
      const taxable = standard + reduced + zero;
      return `
        <tr>
          <td>${entry.month_label}</td>
          <td>£${standard.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td>£${reduced.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td>£${zero.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td>£${exempt.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td>£${outOfScope.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td class="taxable-total">£${taxable.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
      `;
    }).join("");

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VAT Threshold Report — ${client.name}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Open Sans', Arial, sans-serif;
      font-size: 12px;
      color: #1f2937;
      background: white;
      padding: 40px;
      max-width: 900px;
      margin: 0 auto;
    }

    /* Print button — hidden when printing */
    .print-bar {
      background: #f2f7f8;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 12px 20px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .print-bar p { color: #6b7280; font-size: 12px; }
    .print-btn {
      background: #343b46;
      color: white;
      border: none;
      padding: 8px 20px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      font-family: 'Open Sans', Arial, sans-serif;
    }
    .print-btn:hover { background: #2a303a; }

    @media print {
      .print-bar { display: none !important; }
      body { padding: 20px; }
    }

    /* Header */
    .header {
      background: ${firmColour};
      border-radius: 12px;
      padding: 32px 40px;
      color: white;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .header-left h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    .header-left p { font-size: 12px; opacity: 0.7; }
    .header-right { text-align: right; }
    .header-right img { max-height: 50px; max-width: 150px; object-fit: contain; }
    .header-right .firm-name { font-size: 14px; font-weight: 700; }
    .header-right .report-date { font-size: 11px; opacity: 0.7; margin-top: 4px; }

    /* Powered by */
    .powered-by {
      text-align: right;
      font-size: 10px;
      color: #9ca3af;
      margin-bottom: 20px;
    }
    .powered-by span { color: #c9af69; font-weight: 600; }

    /* Client info */
    .client-info {
      background: #f9fafb;
      border-radius: 10px;
      padding: 16px 20px;
      margin-bottom: 20px;
      display: flex;
      gap: 40px;
    }
    .client-info-item label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; display: block; margin-bottom: 2px; }
    .client-info-item span { font-size: 13px; font-weight: 600; color: #1f2937; }

    /* Summary cards */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .summary-card {
      background: #f9fafb;
      border-radius: 10px;
      padding: 14px 16px;
      border-top: 3px solid ${firmColour};
    }
    .summary-card.risk {
      background: ${getRiskBg(riskStatus)};
      border-top-color: ${getRiskColour(riskStatus)};
    }
    .summary-card label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; display: block; margin-bottom: 4px; }
    .summary-card .value { font-size: 18px; font-weight: 700; color: #1f2937; }
    .summary-card.risk .value { color: ${getRiskColour(riskStatus)}; font-size: 14px; }

    /* Progress bar */
    .progress-section {
      margin-bottom: 20px;
    }
    .progress-label {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #6b7280;
      margin-bottom: 6px;
    }
    .progress-bar-bg {
      background: #e5e7eb;
      border-radius: 6px;
      height: 10px;
      width: 100%;
    }
    .progress-bar-fill {
      background: ${getRiskColour(riskStatus)};
      border-radius: 6px;
      height: 10px;
      width: ${progressWidth}%;
    }

    /* Monthly table */
    .section-title {
      font-size: 13px;
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 2px solid ${firmColour};
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 11px;
    }
    thead tr {
      background: ${firmColour};
      color: white;
    }
    thead th {
      padding: 8px 10px;
      text-align: right;
      font-weight: 600;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    thead th:first-child { text-align: left; }
    tbody tr:nth-child(even) { background: #f9fafb; }
    tbody tr:hover { background: #f3f4f6; }
    tbody td {
      padding: 7px 10px;
      text-align: right;
      color: #374151;
      border-bottom: 1px solid #f3f4f6;
    }
    tbody td:first-child { text-align: left; font-weight: 500; }
    .taxable-total { font-weight: 700; color: #1f2937; }

    /* Total row */
    .total-row td {
      background: #f3f4f6;
      font-weight: 700;
      border-top: 2px solid #e5e7eb;
      color: #1f2937;
    }

    /* Info boxes */
    .info-box {
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 16px;
      font-size: 11px;
      line-height: 1.6;
    }
    .info-box.threshold {
      background: #f0fdf4;
      border-left: 4px solid #16a34a;
    }
    .info-box.vat-logic {
      background: #f9fafb;
      border-left: 4px solid ${firmColour};
    }
    .info-box.disclaimer {
      background: #fefce8;
      border-left: 4px solid #ca8a04;
    }
    .info-box strong { display: block; margin-bottom: 4px; color: #1f2937; }

    /* Next review */
    .next-review {
      background: #f9fafb;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 11px;
    }
    .next-review .date { font-weight: 700; font-size: 13px; color: ${firmColour}; }

    /* Footer */
    .footer {
      background: ${firmColour};
      border-radius: 10px;
      padding: 20px 24px;
      color: white;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 24px;
    }
    .footer-left p { font-size: 11px; opacity: 0.8; margin-bottom: 2px; }
    .footer-left .firm-name-footer { font-size: 13px; font-weight: 700; opacity: 1; }
    .footer-right { text-align: right; font-size: 10px; opacity: 0.7; }
    .footer-right a { color: #c9af69; text-decoration: none; }
    .powered { font-size: 10px; opacity: 0.6; margin-top: 4px; }
    .powered span { color: #c9af69; }
  </style>
</head>
<body>

  <!-- Print bar -->
  <div class="print-bar">
    <p>📄 VAT Threshold Report — ${client.name} · ${reportDate}</p>
    <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
  </div>

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <h1>VAT Threshold Report</h1>
      <p>Rolling 12-month taxable turnover analysis</p>
      <p style="margin-top:8px;font-size:11px;opacity:0.6;">Report date: ${reportDate}</p>
    </div>
    <div class="header-right">
      ${firmLogo
        ? `<img src="${firmLogo}" alt="${firmName} logo" />`
        : `<div class="firm-name">${firmName}</div>`}
      <div class="report-date">VAT Checker Report</div>
    </div>
  </div>

  <!-- Powered by -->
  <div class="powered-by">Powered by <span>Maddock & Co. VAT Checker</span></div>

  <!-- Client info -->
  <div class="client-info">
    <div class="client-info-item">
      <label>Client</label>
      <span>${client.name}</span>
    </div>
    ${client.sector ? `<div class="client-info-item"><label>Sector</label><span>${client.sector}</span></div>` : ""}
    <div class="client-info-item">
      <label>Prepared by</label>
      <span>${firmName}</span>
    </div>
    <div class="client-info-item">
      <label>Report date</label>
      <span>${reportDate}</span>
    </div>
    <div class="client-info-item">
      <label>VAT threshold</label>
      <span>£90,000</span>
    </div>
  </div>

  <!-- Summary cards -->
  <div class="summary-grid">
    <div class="summary-card">
      <label>Rolling taxable turnover</label>
      <div class="value">£${rollingTurnover.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </div>
    <div class="summary-card">
      <label>Threshold used</label>
      <div class="value">${thresholdPercent.toFixed(1)}%</div>
    </div>
    <div class="summary-card">
      <label>Remaining to threshold</label>
      <div class="value">£${remaining.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </div>
    <div class="summary-card risk">
      <label>VAT risk status</label>
      <div class="value">${riskStatus}</div>
    </div>
  </div>

  <!-- Progress bar -->
  <div class="progress-section">
    <div class="progress-label">
      <span>VAT Registration Threshold (£90,000)</span>
      <span style="color:${getRiskColour(riskStatus)};font-weight:700;">${thresholdPercent.toFixed(1)}% used</span>
    </div>
    <div class="progress-bar-bg">
      <div class="progress-bar-fill"></div>
    </div>
  </div>

  <!-- HMRC threshold reference -->
  <div class="info-box threshold">
    <strong>HMRC VAT Registration Threshold</strong>
    The current VAT registration threshold is <strong>£90,000</strong> (as at ${reportDate}). A business must register for VAT when its taxable turnover exceeds this amount in any rolling 12-month period. The deregistration threshold is £88,000. Source: HMRC VAT Notice 700/1.
  </div>

  <!-- Monthly breakdown -->
  <div class="section-title">Monthly Turnover Breakdown</div>
  <table>
    <thead>
      <tr>
        <th>Month</th>
        <th>Standard rated (20%)</th>
        <th>Reduced rated (5%)</th>
        <th>Zero rated (0%)</th>
        <th>Exempt</th>
        <th>Out of scope</th>
        <th>Taxable total</th>
      </tr>
    </thead>
    <tbody>
      ${monthRows}
      <tr class="total-row">
        <td>TOTAL</td>
        <td>£${(entries || []).reduce((s, e) => s + Number(e.standard_rated || 0), 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td>£${(entries || []).reduce((s, e) => s + Number(e.reduced_rated || 0), 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td>£${(entries || []).reduce((s, e) => s + Number(e.zero_rated || 0), 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td>£${(entries || []).reduce((s, e) => s + Number(e.exempt || 0), 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td>£${(entries || []).reduce((s, e) => s + Number(e.out_of_scope || 0), 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td>£${rollingTurnover.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
    </tbody>
  </table>

  <!-- VAT logic -->
  <div class="info-box vat-logic">
    <strong>VAT Classification Notes</strong>
    Standard-rated (20%), reduced-rated (5%) and zero-rated (0%) income are included in the taxable turnover calculation. Exempt income and out-of-scope income are excluded from the VAT registration threshold calculation in accordance with HMRC guidance.
  </div>

  <!-- Next review -->
  <div class="next-review">
    <div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;margin-bottom:2px;">Recommended next review</div>
      <div class="date">${nextReviewStr}</div>
    </div>
    <div style="color:#6b7280;font-size:11px;">
      We recommend reviewing VAT threshold positions quarterly or whenever a significant change in turnover is anticipated.
    </div>
  </div>

  <!-- Disclaimer -->
  <div class="info-box disclaimer">
    <strong>Important Disclaimer</strong>
    This report has been prepared for information purposes only and is based on data imported from Xero. It does not constitute professional tax or legal advice. The figures shown are based on the rolling 12-month period ending ${new Date(new Date().getFullYear(), new Date().getMonth() - 1, 0).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}. You should seek professional advice from a qualified accountant or tax adviser before making any decisions regarding VAT registration. ${firmName} accepts no liability for any actions taken or not taken based on this report.
  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-left">
      <div class="firm-name-footer">${firmName}</div>
      ${firmAddress ? `<p>${firmAddress}</p>` : ""}
      ${firmPhone ? `<p>${firmPhone}</p>` : ""}
      ${firmWebsite ? `<p><a href="${firmWebsite}" style="color:#c9af69;">${firmWebsite}</a></p>` : ""}
    </div>
    <div class="footer-right">
      <div>VAT Threshold Report</div>
      <div>${reportDate}</div>
      <div class="powered">Powered by <span>Maddock & Co. VAT Checker</span></div>
    </div>
  </div>

  <script>
    // Auto-trigger print dialog if ?print=1 is in URL
    if (new URLSearchParams(window.location.search).get('print') === '1') {
      window.onload = () => window.print();
    }
  </script>

</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    return new NextResponse(
      `Error generating report: ${error instanceof Error ? error.message : String(error)}`,
      { status: 500 }
    );
  }
}
