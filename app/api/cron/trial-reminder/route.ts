// app/api/cron/trial-reminder/route.ts
// Runs daily at 9am UTC
// Sends reminder emails to firms whose trial expires in 7 days
// Also sends a final warning at 1 day remaining

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const in1Day = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

  // Find firms whose trial expires in 7 days (within a 24-hour window)
  const in7DaysStart = new Date(in7Days);
  in7DaysStart.setHours(0, 0, 0, 0);
  const in7DaysEnd = new Date(in7Days);
  in7DaysEnd.setHours(23, 59, 59, 999);

  // Find firms whose trial expires in 1 day (within a 24-hour window)
  const in1DayStart = new Date(in1Day);
  in1DayStart.setHours(0, 0, 0, 0);
  const in1DayEnd = new Date(in1Day);
  in1DayEnd.setHours(23, 59, 59, 999);

  const { data: firms7Days } = await supabase
    .from("firms")
    .select("id,name")
    .eq("subscription_status", "trial")
    .gte("trial_ends_at", in7DaysStart.toISOString())
    .lte("trial_ends_at", in7DaysEnd.toISOString());

  const { data: firms1Day } = await supabase
    .from("firms")
    .select("id,name")
    .eq("subscription_status", "trial")
    .gte("trial_ends_at", in1DayStart.toISOString())
    .lte("trial_ends_at", in1DayEnd.toISOString());

  const remindersSent: string[] = [];
  const resendApiKey = process.env.RESEND_API_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vat.maddockandco.com";

  async function sendReminder(firmId: string, firmName: string, daysLeft: number) {
    // Get accountant email
    const { data: access } = await supabase
      .from("firm_user_access")
      .select("user_id")
      .eq("firm_id", firmId)
      .limit(1)
      .single();

    if (!access) return;

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("email,full_name")
      .eq("id", access.user_id)
      .single();

    if (!profile?.email || !resendApiKey) return;

    const isUrgent = daysLeft <= 1;
    const subject = isUrgent
      ? `⚠️ Your VATwatchHQ trial expires tomorrow`
      : `Your VATwatchHQ free trial expires in ${daysLeft} days`;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "alerts@maddockandco.com",
        to: [profile.email],
        subject,
        html: `
          <div style="font-family:'Open Sans',Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#343b46;border-radius:12px 12px 0 0;padding:32px 40px;">
              <div style="display:flex;align-items:center;gap:4px;margin-bottom:16px;">
                <span style="color:#c9af69;font-weight:800;font-size:18px;">VAT</span>
                <span style="color:white;font-weight:800;font-size:18px;">watchHQ</span>
              </div>
              <h1 style="color:#ffffff;font-size:24px;font-weight:700;margin:0;">
                ${isUrgent ? "⚠️ Your trial expires tomorrow" : `Your trial expires in ${daysLeft} days`}
              </h1>
            </div>
            <div style="background:#ffffff;padding:32px 40px;">
              <p style="color:#374151;font-size:15px;">Hi ${profile.full_name || "there"},</p>
              <p style="color:#374151;font-size:14px;line-height:1.6;">
                Your VATwatchHQ free trial for <strong>${firmName}</strong> expires 
                ${isUrgent ? "tomorrow" : `in ${daysLeft} days`}. 
                Don't lose access to your VAT threshold monitoring!
              </p>

              ${isUrgent ? `
              <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:20px 0;">
                <p style="color:#991b1b;font-size:14px;font-weight:600;margin:0;">
                  ⚠️ After tomorrow your dashboard will be locked until you subscribe.
                </p>
              </div>` : `
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0;">
                <p style="color:#166534;font-size:14px;font-weight:600;margin:0;">
                  ✅ Your data is safe — subscribe before your trial ends to keep uninterrupted access.
                </p>
              </div>`}

              <p style="color:#374151;font-size:14px;line-height:1.6;margin-bottom:8px;"><strong>What you'll keep with a paid plan:</strong></p>
              <ul style="color:#374151;font-size:14px;line-height:2;padding-left:20px;">
                <li>Automated monthly Xero imports</li>
                <li>VAT threshold alerts to you and your clients</li>
                <li>White-label PDF reports</li>
                <li>Full client history and data</li>
              </ul>

              <div style="text-align:center;margin:32px 0;">
                <a href="${appUrl}/billing" style="background:#343b46;color:#ffffff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">
                  Subscribe now — from £9/month →
                </a>
              </div>
              <p style="color:#6b7280;font-size:12px;line-height:1.6;">
                Plans start from £9/month for solo businesses and £29/month for accounting firms. Cancel anytime.
              </p>
            </div>
            <div style="background:#343b46;border-radius:0 0 12px 12px;padding:24px 40px;display:flex;justify-content:space-between;align-items:center;">
              <div>
                <p style="color:#9ca3af;font-size:12px;margin:0;">VATwatchHQ</p>
                <p style="color:#9ca3af;font-size:11px;margin:4px 0 0 0;">Powered by Maddock & Co. UK Ltd</p>
              </div>
              <a href="https://www.maddockandco.com" style="color:#c9af69;font-size:12px;">maddockandco.com</a>
            </div>
          </div>
        `,
      }),
    });

    remindersSent.push(`${firmName} (${daysLeft} days)`);
  }

  // Send 7-day reminders
  for (const firm of firms7Days || []) {
    await sendReminder(firm.id, firm.name, 7);
  }

  // Send 1-day reminders
  for (const firm of firms1Day || []) {
    await sendReminder(firm.id, firm.name, 1);
  }

  return NextResponse.json({
    ok: true,
    remindersSent,
    message: `${remindersSent.length} trial reminder(s) sent`,
  });
}
