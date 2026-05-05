import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId");

  if (!clientId) {
    return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: connection } = await supabase
    .from("accounting_connections")
    .select("*")
    .eq("client_id", clientId)
    .eq("provider", "xero")
    .single();

  if (!connection) {
    return NextResponse.json({ error: "No Xero connection found" }, { status: 404 });
  }

  const response = await fetch(
    "https://api.xero.com/api.xro/2.0/Invoices?where=Type==\"ACCREC\"",
    {
      headers: {
        Authorization: `Bearer ${connection.access_token}`,
        "Xero-tenant-id": connection.provider_tenant_id,
        Accept: "application/json",
      },
    }
  );

  const data = await response.json();

  return NextResponse.json({
    message: "Invoices fetched",
    count: data.Invoices?.length || 0,
  });
}
