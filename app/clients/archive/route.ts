// app/api/clients/archive/route.ts
// Archives or deletes a client
// Archive: keeps data for 6 years (Companies Act requirement) then auto-deletes
// Delete: immediately removes all client data (only for unarchived clients)

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { clientId, action } = await request.json();

    if (!clientId || !action) {
      return NextResponse.json({ error: "Missing clientId or action" }, { status: 400 });
    }

    if (!["archive", "delete", "restore"].includes(action)) {
      return NextResponse.json({ error: "Invalid action. Use archive, delete or restore." }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get client details
    const { data: client } = await supabase
      .from("clients")
      .select("id,name,firm_id,email,contact_name")
      .eq("id", clientId)
      .single();

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Get accountant email
    const { data: firmAccess } = await supabase
      .from("firm_user_access")
      .select("user_id")
      .eq("firm_id", client.firm_id)
      .limit(1)
      .single();

    let accountantEmail: string | null = null;
    if (firmAccess) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("email,full_name")
        .eq("id", firmAccess.user_id)
        .single();
      accountantEmail = profile?.email || null;
    }

    if (action === "archive") {
      // Archive: mark as archived, set 6-year deletion date
      const archivedAt = new Date();
      const deleteAt = new Date();
      deleteAt.setFullYear(deleteAt.getFullYear() + 6);

      await supabase
        .from("clients")
        .update({
          archived: true,
          archived_at: archivedAt.toISOString(),
          archive_delete_at: deleteAt.toISOString(),
        })
        .eq("id", clientId);

      // Send confirmation email to accountant
      const resendApiKey = process.env.RESEND_API_KEY;
      if (resendApiKey && accountantEmail) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "alerts@maddockandco.com",
            to: [accountantEmail],
            subject: `Client archived — ${client.name}`,
            html: `
              <div style="font-family:'Open Sans',Arial,sans-serif;max-width:600px;margin:0 auto;">
                <div style="background:#343b46;border-radius:12px 12px 0 0;padding:32px 40px;">
                  <p style="color:#c9af69;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin:0 0 8px 0;">Maddock & Co.</p>
                  <h1 style="color:#ffffff;font-size:24px;font-weight:700;margin:0;">Client Archived</h1>
                </div>
                <div style="background:#ffffff;padding:32px 40px;">
                  <p style="color:#374151;font-size:14px;line-height:1.6;"><strong>${client.name}</strong> has been archived on ${archivedAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.</p>
                  <p style="color:#374151;font-size:14px;line-height:1.6;">In accordance with record keeping requirements, all data will be retained until <strong>${deleteAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</strong> (6 years), after which it will be permanently deleted.</p>
                  <p style="color:#374151;font-size:14px;line-height:1.6;">You will receive a reminder email one month before deletion so you can download any reports you need to keep.</p>
                </div>
                <div style="background:#343b46;border-radius:0 0 12px 12px;padding:24px 40px;">
                  <p style="color:#9ca3af;font-size:12px;margin:0;">Maddock & Co. UK Ltd · <a href="https://www.maddockandco.com" style="color:#c9af69;">maddockandco.com</a></p>
                </div>
              </div>
            `,
          }),
        });
      }

      return NextResponse.json({
        ok: true,
        message: `${client.name} archived. Data will be retained until ${deleteAt.toLocaleDateString("en-GB")}.`,
        deleteAt: deleteAt.toISOString(),
      });
    }

    if (action === "restore") {
      await supabase
        .from("clients")
        .update({ archived: false, archived_at: null, archive_delete_at: null })
        .eq("id", clientId);

      return NextResponse.json({ ok: true, message: `${client.name} restored successfully.` });
    }

    if (action === "delete") {
      // Hard delete — remove all data permanently
      // Only allowed for non-archived clients (archived ones must wait 6 years)
      const { data: clientCheck } = await supabase
        .from("clients")
        .select("archived")
        .eq("id", clientId)
        .single();

      if (clientCheck?.archived) {
        return NextResponse.json({
          error: "Cannot delete an archived client. Archived clients are retained for 6 years. You can restore the client first if needed."
        }, { status: 400 });
      }

      // Delete all related data
      await supabase.from("xero_imported_lines").delete().eq("client_id", clientId);
      await supabase.from("turnover_entries").delete().eq("client_id", clientId);
      await supabase.from("vat_reviews").delete().eq("client_id", clientId);
      await supabase.from("vat_alerts").delete().eq("client_id", clientId);
      await supabase.from("accounting_connections").delete().eq("client_id", clientId);
      await supabase.from("account_mappings").delete().eq("client_id", clientId);
      await supabase.from("clients").delete().eq("id", clientId);

      return NextResponse.json({ ok: true, message: `${client.name} permanently deleted.` });
    }

  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
