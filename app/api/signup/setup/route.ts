// app/api/signup/setup/route.ts
// Called after Supabase auth signup to create firm and link user
// Uses service role key to bypass RLS

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { userId, firmName, fullName, email } = await request.json();

    if (!userId || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Create user profile
    await supabase.from("user_profiles").upsert({
      id: userId,
      email,
      full_name: fullName,
      role: "firm_admin",
    });

    // Check if user already has a firm (prevent duplicates)
    const { data: existingAccess } = await supabase
      .from("firm_user_access")
      .select("firm_id")
      .eq("user_id", userId)
      .limit(1)
      .single();

    if (existingAccess?.firm_id) {
      return NextResponse.json({ ok: true, firmId: existingAccess.firm_id });
    }

    // Check for a pending invite matching this email — if found, this person
    // is joining an existing firm as an account manager rather than starting
    // their own firm and trial.
    const { data: invite } = await supabase
      .from("firm_invites")
      .select("*")
      .eq("email", email.toLowerCase().trim())
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (invite) {
      const { error: accessError } = await supabase.from("firm_user_access").insert({
        firm_id: invite.firm_id,
        user_id: userId,
        role: invite.role,
        display_name: invite.display_name || fullName,
      });

      if (accessError) {
        return NextResponse.json(
          { error: `Failed to link account to firm: ${accessError.message}` },
          { status: 500 }
        );
      }

      await supabase
        .from("firm_invites")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", invite.id);

      return NextResponse.json({ ok: true, firmId: invite.firm_id, joinedExistingFirm: true });
    }

    if (!firmName) {
      return NextResponse.json({ error: "Missing firm name" }, { status: 400 });
    }

    // Create the firm
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 30);

    const { data: firm, error: firmError } = await supabase
      .from("firms")
      .insert({
        name: firmName,
        subscription_status: "trial",
        trial_ends_at: trialEndsAt.toISOString(),
      })
      .select()
      .single();

    if (firmError || !firm) {
      return NextResponse.json({ error: `Failed to create firm: ${firmError?.message}` }, { status: 500 });
    }

    // Link user to firm as the owner
    await supabase.from("firm_user_access").insert({
      firm_id: firm.id,
      user_id: userId,
      role: "owner",
      display_name: fullName,
    });

    // Send welcome email via Resend
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `Maddock & Co. <alerts@maddockandco.com>`,
          to: [email],
          subject: "Welcome to VAT Checker — Your free trial has started",
          html: `
            <div style="font-family:'Open Sans',Arial,sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:#343b46;border-radius:12px 12px 0 0;padding:32px 40px;">
                <p style="color:#c9af69;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin:0 0 8px 0;">Maddock & Co.</p>
                <h1 style="color:#ffffff;font-size:24px;font-weight:700;margin:0;">Welcome to VAT Checker</h1>
              </div>
              <div style="background:#ffffff;padding:32px 40px;">
                <p style="color:#374151;font-size:15px;">Hi ${fullName},</p>
                <p style="color:#374151;font-size:14px;line-height:1.6;">Welcome to VAT Checker! Your 30-day free trial for <strong>${firmName}</strong> has started.</p>
                <p style="color:#374151;font-size:14px;line-height:1.6;">Here's how to get started:</p>
                <ol style="color:#374151;font-size:14px;line-height:2;">
                  <li>Sign in at <a href="https://vat.maddockandco.com" style="color:#c9af69;">vat.maddockandco.com</a></li>
                  <li>Add your first client</li>
                  <li>Connect their Xero account</li>
                  <li>Import their data and start monitoring</li>
                </ol>
                <p style="color:#374151;font-size:14px;line-height:1.6;">If you need any help getting set up, please don't hesitate to get in touch.</p>
                <p style="color:#374151;font-size:14px;">The Maddock & Co. team</p>
              </div>
              <div style="background:#343b46;border-radius:0 0 12px 12px;padding:24px 40px;">
                <p style="color:#9ca3af;font-size:12px;margin:0;">Maddock & Co. UK Ltd · <a href="https://www.maddockandco.com" style="color:#c9af69;">maddockandco.com</a></p>
              </div>
            </div>
          `,
        }),
      });

      // Also notify you when a new firm signs up
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `VAT Checker <alerts@maddockandco.com>`,
          to: ["clayton@maddockandco.com"],
          subject: `🎉 New signup — ${firmName}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;">
              <h2 style="color:#343b46;">New firm signed up!</h2>
              <p><strong>Firm:</strong> ${firmName}</p>
              <p><strong>Name:</strong> ${fullName}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Trial ends:</strong> ${trialEndsAt.toLocaleDateString("en-GB")}</p>
            </div>
          `,
        }),
      });
    }

    return NextResponse.json({ ok: true, firmId: firm.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
