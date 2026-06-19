// app/api/clients/assign/route.ts
// Owner assigns (or unassigns) a client to an account manager

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { clientId, accountManagerId, requestedByUserId, firmId } = await request.json();

    if (!clientId || !requestedByUserId || !firmId) {
      return NextResponse.json({ error: "Missing clientId, requestedByUserId or firmId" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Only owners can reassign clients
    const { data: requesterAccess } = await supabase
      .from("firm_user_access")
      .select("role")
      .eq("firm_id", firmId)
      .eq("user_id", requestedByUserId)
      .single();

    if (!requesterAccess || requesterAccess.role !== "owner") {
      return NextResponse.json({ error: "Only firm owners can assign clients" }, { status: 403 });
    }

    const { error } = await supabase
      .from("clients")
      .update({ account_manager_id: accountManagerId || null })
      .eq("id", clientId)
      .eq("firm_id", firmId);

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
