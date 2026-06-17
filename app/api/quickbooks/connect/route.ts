// app/api/quickbooks/connect/route.ts
// Initiates QuickBooks OAuth flow

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId");

  if (!clientId) {
    return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  }

  const targetClientId: string = clientId;
  const qbClientId = process.env.QUICKBOOKS_CLIENT_ID!;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vat.maddockandco.com";
  const redirectUri = `${appUrl}/api/quickbooks/callback`;

  // Encode clientId in state so we know which client to attach the connection to
  const state = Buffer.from(JSON.stringify({ clientId: targetClientId })).toString("base64");

  const authUrl =
    `https://appcenter.intuit.com/connect/oauth2` +
    `?client_id=${qbClientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent("com.intuit.quickbooks.accounting")}` +
    `&state=${state}`;

  return NextResponse.redirect(authUrl);
}
