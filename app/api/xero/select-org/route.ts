// app/api/xero/select-org/route.ts
// Called when the accountant picks which Xero organisation to link

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { clientId, tenantId } = await request.json();

    if (!clientId || !tenantId) {
      return NextResponse.json({ error: "Missing clientId or tenantId" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Update the pending connection with the selected tenant ID
    const { error } = await supabase
      .from("accounting_connections")
      .update({ provider_tenant_id: tenantId })
      .eq("client_id", clientId)
      .eq("provider_tenant_id", "PENDING_SELECTION");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
