// app/api/billing/webhook/route.ts
// Handles Stripe webhook events to update subscription status in database

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature or webhook secret" }, { status: 400 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-02-24.acacia",
  });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json({ error: `Webhook error: ${err}` }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.CheckoutSession;
      const firmId = session.metadata?.firmId;
      const planId = session.metadata?.planId;

      if (firmId) {
        await supabase.from("firms").update({
          subscription_status: "active",
          stripe_plan: planId,
          stripe_subscription_id: session.subscription as string,
        }).eq("id", firmId);
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const firmId = subscription.metadata?.firmId;
      const planId = subscription.metadata?.planId;

      if (firmId) {
        await supabase.from("firms").update({
          subscription_status: subscription.status === "active" ? "active" : subscription.status,
          stripe_plan: planId,
          stripe_subscription_id: subscription.id,
        }).eq("id", firmId);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const firmId = subscription.metadata?.firmId;

      if (firmId) {
        await supabase.from("firms").update({
          subscription_status: "cancelled",
          stripe_plan: null,
        }).eq("id", firmId);
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;

      // Find firm by customer ID and mark as past_due
      const { data: firm } = await supabase
        .from("firms")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .single();

      if (firm) {
        await supabase.from("firms").update({
          subscription_status: "past_due",
        }).eq("id", firm.id);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
