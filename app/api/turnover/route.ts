import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const turnoverSchema = z.object({
  client_id: z.string().uuid(),
  period_start: z.string(),
  standard_rated: z.number().default(0),
  reduced_rated: z.number().default(0),
  zero_rated: z.number().default(0),
  exempt: z.number().default(0),
  out_of_scope: z.number().default(0),
  source: z.string().default("manual"),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = turnoverSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("turnover_entries")
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ turnover_entry: data });
}
