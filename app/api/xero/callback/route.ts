// app/api/xero/callback/route.ts
// Handles the OAuth callback from Xero
// If multiple organisations are available, redirects to a picker page
// so the accountant can choose which organisation to link to this client

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const clientId = url.searchParams.get("state");

  const xeroClientId = process.env.XERO_CLIENT_ID;
  const xeroClientSecret = process.env.XERO_CLIENT_SECRET;
  const redirectUri = process.env.XERO_REDIRECT_URI;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!code || !clientId || !xeroClientId || !xeroClientSecret || !redirectUri || !supabaseUrl || !supabaseKey) {
    return NextResponse.redirect(`${url.origin}/dashboard?xero=error`);
  }

  // Exchange code for token
  const tokenResponse = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${xeroClientId}:${xeroClientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenData.access_token) {
    return NextResponse.redirect(`${url.origin}/dashboard?xero=error&reason=token_failed`);
  }

  // Get all available Xero organisations for this token
  const connectionsResponse = await fetch("https://api.xero.com/connections", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });

  const connections = await connectionsResponse.json();

  if (!connections || connections.length === 0) {
    return NextResponse.redirect(`${url.origin}/dashboard?xero=no-tenant`);
  }

  // If only one organisation available — connect it automatically
  if (connections.length === 1) {
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase.from("accounting_connections").insert({
      client_id: clientId,
      provider: "xero",
      provider_tenant_id: connections[0].tenantId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: new Date(
        Date.now() + Number(tokenData.expires_in || 0) * 1000
      ).toISOString(),
    });

    return NextResponse.redirect(`${url.origin}/dashboard?xero=connected`);
  }

  // Multiple organisations available — store token temporarily and redirect to picker
  // We encode the token and connections in the URL (base64) so the picker can use them
  // Note: token is short-lived (30 mins) so this is safe for the picker flow
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Store the pending connection in Supabase temporarily
  await supabase.from("accounting_connections").insert({
    client_id: clientId,
    provider: "xero",
    provider_tenant_id: "PENDING_SELECTION",
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    token_expires_at: new Date(
      Date.now() + Number(tokenData.expires_in || 0) * 1000
    ).toISOString(),
  });

  // Build picker URL with available organisations
  const orgsParam = encodeURIComponent(
    JSON.stringify(
      connections.map((c: { tenantId: string; tenantName: string }) => ({
        tenantId: c.tenantId,
        tenantName: c.tenantName,
      }))
    )
  );

  return NextResponse.redirect(
    `${url.origin}/dashboard?xero=pick_org&clientId=${clientId}&orgs=${orgsParam}`
  );
}
