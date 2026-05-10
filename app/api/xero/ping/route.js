import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Xero API route test is working",
    time: new Date().toISOString(),
  });
}
