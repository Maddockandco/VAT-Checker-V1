// app/api/quickbooks/callback/route.ts
// Handles QuickBooks OAuth callback — exchanges code for tokens, saves connection

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const state = url.searchParams.get("state");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vat.maddockandco.com";

  if (!code || !realmId || !state) {
    return NextResponse.redirect(`${appUrl}/dashboard?quickbooks=error`);
  }

  const authCode: string = code;
  const tenantId: string = realmId;
  const oauthState: string = state;

  try {
    const { clientId } = JSON.parse(Buffer.from(oauthState, "base64").toString());

    const qbClientId = process.env.QUICKBOOKS_CLIENT_ID!;
    const qbClientSecret = process.env.QUICKBOOKS_CLIENT_SECRET!;
    const redirectUri = `${appUrl}/api/quickbooks/callback`;

    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${qbClientId}:${qbClientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: authCode,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return NextResponse.redirect(`${appUrl}/dashboard?quickbooks=error`);
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Remove any existing QuickBooks connection for this client
    await supabase
      .from("accounting_connections")
      .delete()
      .eq("client_id", clientId)
      .eq("provider", "quickbooks");

    // Save new connection
    await supabase.from("accounting_connections").insert({
      client_id: clientId,
      provider: "quickbooks",
      provider_tenant_id: tenantId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: expiresAt,
      connected_at: new Date().toISOString(),
    });

    return NextResponse.redirect(`${appUrl}/dashboard?client=${clientId}&quickbooks=connected`);
  } catch (error) {
    return NextResponse.redirect(`${appUrl}/dashboard?quickbooks=error`);
  }
}
