// app/billing/page.tsx
// Billing page — shows current plan, upgrade options and payment history

"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

type Plan = {
  id: string;
  name: string;
  price: number;
  priceId: string;
  clients: string;
  features: string[];
  recommended?: boolean;
};

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: 29,
    priceId: process.env.NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID || "",
    clients: "Up to 10 clients",
    features: [
      "Up to 10 monitored clients",
      "Xero integration",
      "Automated monthly imports",
      "Email alerts to accountant & client",
      "White-label PDF reports",
      "VAT threshold monitoring",
      "6-year data retention",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: 59,
    priceId: process.env.NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID || "",
    clients: "Up to 20 clients",
    recommended: true,
    features: [
      "Up to 20 monitored clients",
      "Everything in Starter",
      "Priority email support",
      "Advanced risk reporting",
      "Custom firm branding",
      "Client portal access",
    ],
  },
  {
    id: "practice",
    name: "Practice",
    price: 99,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRACTICE_PRICE_ID || "",
    clients: "Unlimited clients",
    features: [
      "Unlimited monitored clients",
      "Everything in Growth",
      "Dedicated account manager",
      "API access",
      "Custom integrations",
      "SLA guarantee",
    ],
  },
];

export default function BillingPage() {
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [firmId, setFirmId] = useState<string | null>(null);
  const [firmName, setFirmName] = useState("");
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>("trial");
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [clientCount, setClientCount] = useState(0);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadBillingData();

    // Check for success/cancel from Stripe redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "1") {
      setMessage("✅ Payment successful! Your subscription is now active.");
      window.history.replaceState({}, "", "/billing");
    } else if (params.get("cancelled") === "1") {
      setMessage("Payment cancelled. You can try again anytime.");
      window.history.replaceState({}, "", "/billing");
    }
  }, []);

  async function loadBillingData() {
    if (!supabase) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/dashboard"; return; }

    const { data: access } = await supabase
      .from("firm_user_access")
      .select("firm_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!access?.firm_id) { setLoading(false); return; }
    setFirmId(access.firm_id);

    const { data: firm } = await supabase
      .from("firms")
      .select("name,subscription_status,trial_ends_at,stripe_plan,stripe_subscription_id")
      .eq("id", access.firm_id)
      .single();

    if (firm) {
      setFirmName(firm.name);
      setSubscriptionStatus(firm.subscription_status);
      setTrialEndsAt(firm.trial_ends_at);
      setCurrentPlan(firm.stripe_plan || null);
    }

    const { count } = await supabase
      .from("clients")
      .select("id", { count: "exact" })
      .eq("firm_id", access.firm_id)
      .eq("archived", false);

    setClientCount(count || 0);
    setLoading(false);
  }

  async function startCheckout(plan: Plan) {
    if (!firmId) return;
    setCheckoutLoading(plan.id);
    setMessage("");

    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firmId, priceId: plan.priceId, planId: plan.id }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setMessage(`❌ ${data.error || "Failed to start checkout"}`);
      }
    } catch (err) {
      setMessage(`❌ ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setCheckoutLoading(null);
  }

  async function openCustomerPortal() {
    if (!firmId) return;
    setMessage("Opening billing portal...");
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firmId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setMessage(`❌ ${data.error || "Failed to open portal"}`);
      }
    } catch (err) {
      setMessage(`❌ ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  const trialDaysLeft = trialEndsAt
    ? Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f2f7f8] flex items-center justify-center" style={{ fontFamily: "'Open Sans', sans-serif" }}>
        <p className="text-slate-400">Loading billing...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f2f7f8] p-6" style={{ fontFamily: "'Open Sans', sans-serif" }}>
      <div className="mx-auto max-w-5xl">

        {/* Header */}
        <div className="mb-6 rounded-3xl bg-[#343b46] p-8 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#c9af69] font-semibold uppercase tracking-widest mb-2">Maddock & Co.</p>
              <h1 className="text-3xl font-bold">Billing & Plans</h1>
              <p className="mt-1 text-slate-300 text-sm">{firmName}</p>
            </div>
            <Link href="/dashboard" className="rounded-xl px-4 py-2 text-sm font-semibold text-white border border-white/20 bg-white/10 hover:bg-white/20 transition-colors">
              ← Dashboard
            </Link>
          </div>
        </div>

        {message && (
          <div className={`mb-6 rounded-2xl p-4 text-sm border-l-4 ${message.startsWith("✅") ? "bg-green-50 border-green-400 text-green-800" : message.startsWith("❌") ? "bg-red-50 border-red-400 text-red-800" : "bg-[#f2f7f8] border-[#c9af69] text-[#343b46]"}`}>
            {message}
          </div>
        )}

        {/* Current status */}
        <div className="mb-8 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[#343b46] mb-4">Current Status</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl bg-[#f2f7f8] p-4">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Plan</p>
              <p className="font-bold text-[#343b46]">
                {currentPlan ? PLANS.find(p => p.id === currentPlan)?.name || currentPlan : "Free Trial"}
              </p>
            </div>
            <div className="rounded-xl bg-[#f2f7f8] p-4">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Status</p>
              <p className={`font-bold ${subscriptionStatus === "active" ? "text-green-600" : subscriptionStatus === "trial" ? "text-yellow-600" : "text-red-600"}`}>
                {subscriptionStatus === "trial" ? `Free Trial${trialDaysLeft !== null ? ` — ${trialDaysLeft} days left` : ""}` : subscriptionStatus.charAt(0).toUpperCase() + subscriptionStatus.slice(1)}
              </p>
            </div>
            <div className="rounded-xl bg-[#f2f7f8] p-4">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Active clients</p>
              <p className="font-bold text-[#343b46]">{clientCount}</p>
            </div>
          </div>

          {subscriptionStatus === "active" && (
            <button onClick={openCustomerPortal} className="mt-4 rounded-xl border border-[#343b46] px-4 py-2 text-sm font-semibold text-[#343b46] hover:bg-[#f2f7f8] transition-colors">
              Manage subscription & invoices →
            </button>
          )}
        </div>

        {/* Plans */}
        <h2 className="text-xl font-bold text-[#343b46] mb-4">
          {subscriptionStatus === "active" ? "Change Plan" : "Choose a Plan"}
        </h2>
        <div className="grid gap-6 md:grid-cols-3 mb-8">
          {PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            return (
              <div key={plan.id} className={`rounded-2xl bg-white shadow-sm overflow-hidden ${plan.recommended ? "ring-2 ring-[#c9af69]" : ""}`}>
                {plan.recommended && (
                  <div className="bg-[#c9af69] text-[#343b46] text-center text-xs font-bold py-2 uppercase tracking-wide">
                    Most Popular
                  </div>
                )}
                <div className="p-6">
                  <h3 className="text-lg font-bold text-[#343b46]">{plan.name}</h3>
                  <p className="text-sm text-slate-500 mb-4">{plan.clients}</p>
                  <div className="mb-6">
                    <span className="text-4xl font-bold text-[#343b46]">£{plan.price}</span>
                    <span className="text-slate-400 text-sm">/month</span>
                    <p className="text-xs text-slate-400 mt-1">excl. VAT</p>
                  </div>
                  <ul className="space-y-2 mb-6">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-slate-600">
                        <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <div className="w-full rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm font-semibold text-green-700 text-center">
                      ✓ Current plan
                    </div>
                  ) : (
                    <button
                      onClick={() => startCheckout(plan)}
                      disabled={checkoutLoading === plan.id}
                      className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-50 ${plan.recommended ? "bg-[#c9af69] text-[#343b46] hover:bg-[#b89d58]" : "bg-[#343b46] text-white hover:bg-[#2a303a]"}`}
                    >
                      {checkoutLoading === plan.id ? "Loading..." : subscriptionStatus === "active" ? `Switch to ${plan.name}` : `Start ${plan.name}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <div className="rounded-2xl bg-white p-5 text-sm text-slate-500 shadow-sm border-l-4 border-[#c9af69]">
          <strong className="text-[#343b46]">Secure payments by Stripe.</strong> Cancel anytime — no long-term contracts. All plans include a 30-day free trial for new accounts. Prices exclude VAT.
        </div>

      </div>
    </main>
  );
}
