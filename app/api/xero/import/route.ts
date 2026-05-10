import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 5;

const XERO_DELAY_BETWEEN_CALLS_MS = 500;
const XERO_RATE_LIMIT_WAIT_MS = 15000;
const XERO_MAX_RETRIES = 3;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const clientId = url.searchParams.get("clientId");
    const source = url.searchParams.get("source");
    const offset = Number(url.searchParams.get("offset") || 0);

    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit") || DEFAULT_LIMIT), 1),
      MAX_LIMIT
    );

    const debug = url.searchParams.get("debug") === "true";

    await sleep(500);

    return NextResponse.json({
      ok: true,
      message: "Xero import route working correctly",
      settings: {
        DEFAULT_LIMIT,
        MAX_LIMIT,
        XERO_DELAY_BETWEEN_CALLS_MS,
        XERO_RATE_LIMIT_WAIT_MS,
        XERO_MAX_RETRIES,
      },
      received: {
        clientId,
        source,
        offset,
        limit,
        debug,
      },
      nextOffset: offset + limit,
      done: false,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
