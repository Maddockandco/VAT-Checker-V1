import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const reviewSchema = z.object({
  client_id: z.string().uuid(),
  rolling_taxable_turnover: z.number(),
  expected_next_30_days: z.number().default(0),
  risk_status: z.string(),
  advice_note: z.string().optional(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = reviewSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("vat_reviews")
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ vat_review: data });
}
