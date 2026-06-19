// app/api/team/invite/route.ts
// Owner invites a new account manager by email.
// Creates a firm_invites row; if the person already has a VATwatchHQ account,
// links them to the firm immediately. Otherwise they get linked automatically
// when they sign up using the invited email address.

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { firmId, invitedByUserId, email, displayName, role } = await request.json();

    if (!firmId || !invitedByUserId || !email) {
      return NextResponse.json({ error: "Missing firmId, invitedByUserId or email" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Confirm the inviter is actually an owner of this firm
    const { data: inviterAccess } = await supabase
      .from("firm_user_access")
      .select("role")
      .eq("firm_id", firmId)
      .eq("user_id", invitedByUserId)
      .single();

    if (!inviterAccess || inviterAccess.role !== "owner") {
      return NextResponse.json({ error: "Only firm owners can invite team members" }, { status: 403 });
    }

    const normalisedEmail = String(email).toLowerCase().trim();
    const inviteRole = role === "owner" ? "owner" : "account_manager";

    // Check for an existing pending invite for this email + firm to avoid duplicates
    const { data: existingInvite } = await supabase
      .from("firm_invites")
      .select("id")
      .eq("firm_id", firmId)
      .eq("email", normalisedEmail)
      .eq("status", "pending")
      .limit(1)
      .single();

    if (existingInvite) {
      return NextResponse.json({ error: "An invite has already been sent to this email" }, { status: 400 });
    }

    const { data: invite, error: inviteError } = await supabase
      .from("firm_invites")
      .insert({
        firm_id: firmId,
        email: normalisedEmail,
        display_name: displayName || null,
        role: inviteRole,
        invited_by: invitedByUserId,
        status: "pending",
      })
      .select()
      .single();

    if (inviteError || !invite) {
      return NextResponse.json({ error: inviteError?.message || "Failed to create invite" }, { status: 500 });
    }

    // Get firm name for the email
    const { data: firm } = await supabase.from("firms").select("name").eq("id", firmId).single();

    // Send invite email
    const resendApiKey = process.env.RESEND_API_KEY;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vat.maddockandco.com";

    if (resendApiKey) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "alerts@maddockandco.com",
          to: [normalisedEmail],
          subject: `You've been invited to join ${firm?.name || "a firm"} on VATwatchHQ`,
          html: `
            <div style="font-family:'Open Sans',Arial,sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:#343b46;border-radius:12px 12px 0 0;padding:32px 40px;">
                <div style="display:flex;align-items:center;gap:4px;margin-bottom:16px;">
                  <span style="color:#c9af69;font-weight:800;font-size:18px;">VAT</span>
                  <span style="color:white;font-weight:800;font-size:18px;">watchHQ</span>
                </div>
                <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0;">You've been invited</h1>
              </div>
              <div style="background:#ffffff;padding:32px 40px;">
                <p style="color:#374151;font-size:15px;">Hi${displayName ? ` ${displayName}` : ""},</p>
                <p style="color:#374151;font-size:14px;line-height:1.6;">
                  You've been invited to join <strong>${firm?.name || "a firm"}</strong> on VATwatchHQ as ${inviteRole === "owner" ? "an owner" : "an account manager"}.
                  ${inviteRole === "account_manager" ? "You'll be able to monitor the VAT positions of clients assigned to you." : ""}
                </p>
                <div style="text-align:center;margin:32px 0;">
                  <a href="${appUrl}/signup?invited=${encodeURIComponent(normalisedEmail)}" style="background:#343b46;color:#ffffff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">
                    Accept invite & create your account →
                  </a>
                </div>
                <p style="color:#6b7280;font-size:12px;">Sign up using this email address (${normalisedEmail}) to automatically join the firm.</p>
              </div>
              <div style="background:#343b46;border-radius:0 0 12px 12px;padding:24px 40px;">
                <p style="color:#9ca3af;font-size:12px;margin:0;">Powered by Maddock & Co. UK Ltd</p>
              </div>
            </div>
          `,
        }),
      });
    }

    return NextResponse.json({ ok: true, invite });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// GET — list team members + pending invites for a firm
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const firmId = url.searchParams.get("firmId");
    if (!firmId) return NextResponse.json({ error: "Missing firmId" }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: access } = await supabase
      .from("firm_user_access")
      .select("user_id,role,display_name")
      .eq("firm_id", firmId);

    const userIds = (access || []).map((a) => a.user_id);
    let profiles: Array<{ id: string; email: string | null }> = [];
    if (userIds.length > 0) {
      const { data } = await supabase
        .from("user_profiles")
        .select("id,email")
        .in("id", userIds);
      profiles = data || [];
    }

    const members = (access || []).map((a) => ({
      user_id: a.user_id,
      role: a.role,
      display_name: a.display_name,
      email: profiles.find((p) => p.id === a.user_id)?.email,
    }));

    const { data: invites } = await supabase
      .from("firm_invites")
      .select("id,email,display_name,status,created_at")
      .eq("firm_id", firmId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    return NextResponse.json({ ok: true, members, invites: invites || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// DELETE — revoke a pending invite
export async function DELETE(request: Request) {
  try {
    const { inviteId } = await request.json();
    if (!inviteId) return NextResponse.json({ error: "Missing inviteId" }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await supabase.from("firm_invites").update({ status: "revoked" }).eq("id", inviteId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
