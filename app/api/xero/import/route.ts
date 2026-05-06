import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const VAT_THRESHOLD = 90000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: review } = await supabase
    .from("vat_reviews")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!review) {
    return NextResponse.json({ error: "No VAT review found" });
  }

  const turnover = Number(review.rolling_taxable_turnover);
  const percent = (turnover / VAT_THRESHOLD) * 100;

  let alertType = null;
  let message = "";

  if (percent >= 100) {
    alertType = "BREACH";
    message = "VAT threshold exceeded – registration required immediately.";
  } else if (percent >= 90) {
    alertType = "HIGH";
    message = "VAT turnover above 90% – urgent review required.";
  } else if (percent >= 80) {
    alertType = "WARNING";
    message = "VAT turnover above 80% – monitor closely.";
  }

  if (alertType) {
    await supabase.from("vat_alerts").insert({
      client_id: clientId,
      threshold_percentage: percent,
      alert_type: alertType,
      message,
    });
  }

  return NextResponse.json({
    message: "Alert check complete",
    turnover,
    percent,
    alertType,
  });
}
