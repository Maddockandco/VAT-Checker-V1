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

  if (!code || !clientId) {
    return NextResponse.json({
      step: "callback-start",
      error: "Missing Xero code or client state",
      fullUrl: request.url,
      code,
      clientId,
      allParams: Object.fromEntries(url.searchParams.entries()),
    });
  }

  if (!xeroClientId || !xeroClientSecret || !redirectUri || !supabaseUrl || !supabaseKey) {
    return NextResponse.json({
      step: "environment-check",
      error: "Missing server environment variables",
      hasXeroClientId: Boolean(xeroClientId),
      hasXeroClientSecret: Boolean(xeroClientSecret),
      hasRedirectUri: Boolean(redirectUri),
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(supabaseKey),
    });
  }

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

  if (!tokenResponse.ok) {
    return NextResponse.json({
      step: "token-exchange",
      error: "Xero token exchange failed",
      details: await tokenResponse.text(),
    });
  }

  const tokenData = await tokenResponse.json();

  const connectionsResponse = await fetch("https://api.xero.com/connections", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });

  if (!connectionsResponse.ok) {
    return NextResponse.json({
      step: "xero-connections",
      error: "Xero connections lookup failed",
      details: await connectionsResponse.text(),
    });
  }

  const connections = await connectionsResponse.json();
  const firstConnection = connections[0];

  if (!firstConnection?.tenantId) {
    return NextResponse.json({
      step: "tenant-check",
      error: "No Xero tenant found",
      connections,
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from("accounting_connections")
    .insert({
      client_id: clientId,
      provider: "xero",
      provider_tenant_id: firstConnection.tenantId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({
      step: "supabase-insert",
      error: "Supabase insert failed",
      details: error.message,
      clientId,
      tenantId: firstConnection.tenantId,
    });
  }

  return NextResponse.json({
    step: "success",
    message: "Xero connection saved successfully",
    connectionId: data.id,
    clientId,
    tenantId: firstConnection.tenantId,
    hasAccessToken: Boolean(tokenData.access_token),
    hasRefreshToken: Boolean(tokenData.refresh_token),
  });
}
