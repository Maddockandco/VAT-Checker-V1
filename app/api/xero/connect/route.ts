import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");

  if (!clientId) {
    return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  }

  const xeroClientId = process.env.XERO_CLIENT_ID;
  const redirectUri = process.env.XERO_REDIRECT_URI;

  if (!xeroClientId || !redirectUri) {
    return NextResponse.json(
      { error: "Missing Xero environment variables" },
      { status: 500 }
    );
  }

  const scope = [
    "offline_access",
    "accounting.transactions",
    "accounting.settings.read",
  ].join(" ");

  const state = encodeURIComponent(clientId);

  const url =
    "https://login.xero.com/identity/connect/authorize" +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(xeroClientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${state}`;

  return NextResponse.redirect(url);
}
