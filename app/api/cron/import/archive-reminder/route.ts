// app/api/cron/archive-reminder/route.ts
// Runs daily — checks for archived clients whose deletion date is within 30 days
// Sends reminder email to accountant to download any reports before deletion
// Also auto-deletes clients whose 6-year retention period has expired

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
  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);

  // Find archived clients whose deletion date is within 30 days
  const { data: dueSoon } = await supabase
    .from("clients")
    .select("id,name,firm_id,email,contact_name,archive_delete_at")
    .eq("archived", true)
    .lte("archive_delete_at", in30Days.toISOString())
    .gte("archive_delete_at", now.toISOString());

  // Find archived clients whose deletion date has passed — auto-delete
  const { data: dueDelete } = await supabase
    .from("clients")
    .select("id,name,firm_id,archive_delete_at")
    .eq("archived", true)
    .lt("archive_delete_at", now.toISOString());

  const remindersSent: string[] = [];
  const autoDeleted: string[] = [];
  const resendApiKey = process.env.RESEND_API_KEY;

  // Send reminder emails
  for (const client of dueSoon || []) {
    const { data: firmAccess } = await supabase
      .from("firm_user_access")
      .select("user_id")
      .eq("firm_id", client.firm_id)
      .limit(1)
      .single();

    if (!firmAccess) continue;

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("email,full_name")
      .eq("id", firmAccess.user_id)
      .single();

    if (!profile?.email || !resendApiKey) continue;

    const deleteDate = new Date(client.archive_delete_at).toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric"
    });
    const daysLeft = Math.ceil(
      (new Date(client.archive_delete_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "alerts@maddockandco.com",
        to: [profile.email],
        subject: `⚠️ Action required — ${client.name} data will be deleted in ${daysLeft} days`,
        html: `
          <div style="font-family:'Open Sans',Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#343b46;border-radius:12px 12px 0 0;padding:32px 40px;">
              <p style="color:#c9af69;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin:0 0 8px 0;">Maddock & Co.</p>
              <h1 style="color:#ffffff;font-size:24px;font-weight:700;margin:0;">Archived Client Data — Deletion Notice</h1>
            </div>
            <div style="background:#ffffff;padding:32px 40px;">
              <p style="color:#374151;font-size:15px;">Dear ${profile.full_name || "Accountant"},</p>
              <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:20px 0;">
                <p style="color:#991b1b;font-size:14px;font-weight:600;margin:0;">⚠️ Action required within ${daysLeft} days</p>
              </div>
              <p style="color:#374151;font-size:14px;line-height:1.6;">The archived client record for <strong>${client.name}</strong> is scheduled for permanent deletion on <strong>${deleteDate}</strong> in accordance with our 6-year data retention policy.</p>
              <p style="color:#374151;font-size:14px;line-height:1.6;">If you need to keep any records, please log in to VAT Checker and download any VAT threshold reports before this date.</p>
              <div style="text-align:center;margin:32px 0;">
                <a href="https://vat.maddockandco.com/dashboard" style="background:#343b46;color:#ffffff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">
                  Download reports →
                </a>
              </div>
              <p style="color:#6b7280;font-size:12px;">After ${deleteDate}, all data for ${client.name} will be permanently and irreversibly deleted from our systems.</p>
            </div>
            <div style="background:#343b46;border-radius:0 0 12px 12px;padding:24px 40px;">
              <p style="color:#9ca3af;font-size:12px;margin:0;">Maddock & Co. UK Ltd · <a href="https://www.maddockandco.com" style="color:#c9af69;">maddockandco.com</a></p>
            </div>
          </div>
        `,
      }),
    });

    remindersSent.push(client.name);
  }

  // Auto-delete expired archived clients
  for (const client of dueDelete || []) {
    await supabase.from("xero_imported_lines").delete().eq("client_id", client.id);
    await supabase.from("turnover_entries").delete().eq("client_id", client.id);
    await supabase.from("vat_reviews").delete().eq("client_id", client.id);
    await supabase.from("vat_alerts").delete().eq("client_id", client.id);
    await supabase.from("accounting_connections").delete().eq("client_id", client.id);
    await supabase.from("account_mappings").delete().eq("client_id", client.id);
    await supabase.from("clients").delete().eq("id", client.id);
    autoDeleted.push(client.name);
  }

  return NextResponse.json({
    ok: true,
    remindersSent,
    autoDeleted,
    message: `${remindersSent.length} reminders sent, ${autoDeleted.length} clients auto-deleted`,
  });
}
