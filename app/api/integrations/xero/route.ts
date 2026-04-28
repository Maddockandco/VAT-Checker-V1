import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "planned",
    message: "Xero OAuth integration placeholder. Add Xero client ID, client secret, callback route and tenant token storage here.",
  });
}
