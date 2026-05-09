import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId");

    if (!clientId) {
      return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json(
        { error: "Missing Supabase environment variables" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { error: turnoverError } = await supabase
      .from("turnover_entries")
      .delete()
      .eq("client_id", clientId)
      .eq("source", "xero");

    if (turnoverError) {
      return NextResponse.json(
        {
          error: "Could not reset Xero turnover entries",
          details: turnoverError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Xero import reset complete",
      clientId,
      deleted: {
        turnover_entries: true,
      },
      nextStep:
        "Run the Xero import again from offset 0 for invoices, bank_transactions and manual_journals.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unexpected reset failure",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
