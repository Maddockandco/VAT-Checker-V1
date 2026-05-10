import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);

  return NextResponse.json({
    ok: true,
    message: "Xero import route is loading correctly",
    received: {
      clientId: url.searchParams.get("clientId"),
      source: url.searchParams.get("source"),
      offset: url.searchParams.get("offset"),
      limit: url.searchParams.get("limit"),
      debug: url.searchParams.get("debug"),
    },
    time: new Date().toISOString(),
  });
}
