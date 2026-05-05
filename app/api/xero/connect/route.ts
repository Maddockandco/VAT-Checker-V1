import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);

  const allParams = Object.fromEntries(url.searchParams.entries());

  return NextResponse.json({
    message: "Xero callback reached",
    fullUrl: request.url,
    receivedParams: allParams,
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
    error: url.searchParams.get("error"),
    error_description: url.searchParams.get("error_description"),
  });
}
