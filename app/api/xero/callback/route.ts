import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const clientId = url.searchParams.get("state");

  if (!code || !clientId) {
    return NextResponse.json(
      { error: "Missing Xero code or client state" },
      { status: 400 }
    );
  }

  const xeroClientId = process.env.XERO_CLIENT_ID;
  const xeroClientSecret = process.env.XERO_CLIENT_SECRET;
  const redirectUri = process.env.XERO_REDIRECT_URI;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!xeroClientId || !xeroClientSecret || !redirectUri || !supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Missing server environment variables" },
      { status: 500 }
    );
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
    const errorText = await tokenResponse.text();
    return NextResponse.json(
      { error: "Xero token exchange failed", details: errorText },
      { status: 400 }
    );
  }

  const tokenData = await tokenResponse.json();

  const connectionsResponse = await fetch("https://api.xero.com/connections", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });

  if (!connectionsResponse.ok) {
    const errorText = await connectionsResponse.text();
    return NextResponse.json(
      { error: "Xero connections lookup failed", details: errorText },
      { status: 400 }
    );
  }

  const connections = await connectionsResponse.json();
  const firstConnection = connections[0];

  if (!firstConnection?.tenantId) {
    return NextResponse.json(
      { error: "No Xero tenant found" },
      { status: 400 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  await supabase.from("accounting_connections").insert({
    client_id: clientId,
    provider: "xero",
    provider_tenant_id: firstConnection.tenantId,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
  });

  return NextResponse.redirect(`${url.origin}/dashboard?xero=connected`);
}
