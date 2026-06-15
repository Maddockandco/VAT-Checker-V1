// app/api/billing/checkout/route.ts
// Creates a Stripe Checkout session for subscription

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { firmId, priceId, planId } = await request.json();

    if (!firmId || !priceId) {
      return NextResponse.json({ error: "Missing firmId or priceId" }, { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2024-12-18.acacia",
    });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get firm details
    const { data: firm } = await supabase
      .from("firms")
      .select("name,stripe_customer_id")
      .eq("id", firmId)
      .single();

    if (!firm) {
      return NextResponse.json({ error: "Firm not found" }, { status: 404 });
    }

    // Get accountant email
    const { data: access } = await supabase
      .from("firm_user_access")
      .select("user_id")
      .eq("firm_id", firmId)
      .limit(1)
      .single();

    let email = "";
    if (access) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("email")
        .eq("id", access.user_id)
        .single();
      email = profile?.email || "";
    }

    // Get or create Stripe customer
    let customerId = firm.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: firm.name,
        email,
        metadata: { firmId },
      });
      customerId = customer.id;

      // Save customer ID to database
      await supabase
        .from("firms")
        .update({ stripe_customer_id: customerId })
        .eq("id", firmId);
    }

    // Create checkout session
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vat.maddockandco.com";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${appUrl}/billing?success=1`,
      cancel_url: `${appUrl}/billing?cancelled=1`,
      metadata: { firmId, planId },
      subscription_data: {
        metadata: { firmId, planId },
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
