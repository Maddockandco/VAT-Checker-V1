import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: client } = await supabase
    .from("clients")
    .select("id,name,email,contact_name,firm_id")
    .eq("id", clientId)
    .single();

  const { data: review } = await supabase
    .from("vat_reviews")
    .select("rolling_taxable_turnover,risk_status")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const { data: firmAccess } = await supabase
    .from("firm_user_access")
    .select("user_id")
    .eq("firm_id", client?.firm_id)
    .limit(1)
    .single();

  const { data: accountant } = await supabase
    .from("user_profiles")
    .select("email,full_name")
    .eq("id", firmAccess?.user_id)
    .single();

  return NextResponse.json({ client, review, firmAccess, accountant });
}
