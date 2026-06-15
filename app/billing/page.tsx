// app/billing/page.tsx
// Animated billing page with all 7 plans

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
  clientLimit: number | null;
  perClient: string;
  color: string;
  features: string[];
  recommended?: boolean;
  popular?: boolean;
};

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    priceId: "",
    clients: "1 business",
    clientLimit: 1,
    perClient: "Free forever",
    color: "#6b7280",
    features: [
      "1 business monitored",
      "Manual data entry",
      "Basic threshold gauge",
      "VAT risk status",
    ],
  },
  {
    id: "solo",
    name: "Solo",
    price: 9,
    priceId: process.env.NEXT_PUBLIC_STRIPE_SOLO_PRICE_ID || "",
    clients: "1 business",
    clientLimit: 1,
    perClient: "£9.00 per business",
    color: "#0891b2",
    features: [
      "1 business monitored",
      "Xero integration",
      "Automated monthly imports",
      "Email alerts",
      "PDF reports",
      "VAT threshold monitoring",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: 29,
    priceId: process.env.NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID || "",
    clients: "Up to 10 clients",
    clientLimit: 10,
    perClient: "£2.90 per client",
    color: "#7c3aed",
    features: [
      "Up to 10 monitored clients",
      "Xero integration",
      "Automated monthly imports",
      "Email alerts to accountant & client",
      "White-label PDF reports",
      "6-year data retention",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: 49,
    priceId: process.env.NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID || "",
    clients: "Up to 20 clients",
    clientLimit: 20,
    perClient: "£2.45 per client",
    color: "#c9af69",
    recommended: true,
    features: [
      "Up to 20 monitored clients",
      "Everything in Starter",
      "Priority email support",
      "Advanced risk reporting",
      "Custom firm branding",
    ],
  },
  {
    id: "growth_pro",
    name: "Growth Pro",
    price: 64,
    priceId: process.env.NEXT_PUBLIC_STRIPE_GROWTH_PRO_PRICE_ID || "",
    clients: "Up to 30 clients",
    clientLimit: 30,
    perClient: "£2.13 per client",
    color: "#ea580c",
    features: [
      "Up to 30 monitored clients",
      "Everything in Growth",
      "Dedicated account manager",
      "Bulk import tools",
      "Advanced analytics",
    ],
  },
  {
    id: "growth_max",
    name: "Growth Max",
    price: 74,
    priceId: process.env.NEXT_PUBLIC_STRIPE_GROWTH_MAX_PRICE_ID || "",
    clients: "Up to 40 clients",
    clientLimit: 40,
    perClient: "£1.85 per client",
    color: "#dc2626",
    features: [
      "Up to 40 monitored clients",
      "Everything in Growth Pro",
      "API access",
      "Custom integrations",
      "Priority SLA",
    ],
  },
  {
    id: "unlimited",
    name: "Unlimited",
    price: 99,
    priceId: process.env.NEXT_PUBLIC_STRIPE_UNLIMITED_PRICE_ID || "",
    clients: "Unlimited clients",
    clientLimit: null,
    perClient: "< £1 per client at 100+",
    color: "#343b46",
    popular: true,
    features: [
      "Unlimited monitored clients",
      "Everything in Growth Max",
      "White-label platform",
      "Multi-user firm access",
      "Custom domain support",
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
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    loadBillingData();
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "1") {
      setMessage("✅ Payment successful! Your subscription is now active.");
      window.history.replaceState({}, "", "/billing");
    } else if (params.get("cancelled") === "1") {
      setMessage("Payment cancelled. You can try again anytime.");
      window.history.replaceState({}, "", "/billing");
    }
    // Trigger entrance animations
    setTimeout(() => setVisible(true), 100);
  }, []);

  async function loadBillingData() {
    if (!supabase) return;
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/dashboard"; return; }
    const { data: access } = await supabase.from("firm_user_access").select("firm_id").eq("user_id", user.id).limit(1).single();
    if (!access?.firm_id) { setLoading(false); return; }
    setFirmId(access.firm_id);
    const { data: firm } = await supabase.from("firms").select("name,subscription_status,trial_ends_at,stripe_plan,stripe_subscription_id").eq("id", access.firm_id).single();
    if (firm) {
      setFirmName(firm.name);
      setSubscriptionStatus(firm.subscription_status);
      setTrialEndsAt(firm.trial_ends_at);
      setCurrentPlan(firm.stripe_plan || null);
    }
    const { count } = await supabase.from("clients").select("id", { count: "exact" }).eq("firm_id", access.firm_id).eq("archived", false);
    setClientCount(count || 0);
    setLoading(false);
  }

  async function startCheckout(plan: Plan) {
    if (!firmId) return;
    if (plan.price === 0) {
      setMessage("✅ You're on the Free plan — no payment needed!");
      return;
    }
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
      if (data.url) { window.location.href = data.url; }
      else { setMessage(`❌ ${data.error || "Failed to open portal"}`); }
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
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#343b46] border-t-[#c9af69] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400 text-sm">Loading billing...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f2f7f8]" style={{ fontFamily: "'Open Sans', sans-serif" }}>

      {/* Animated header */}
      <div
        className="bg-[#343b46]"
        style={{
          transition: "opacity 700ms ease, transform 700ms ease",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(-16px)",
        }}
      >
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#c9af69] font-semibold uppercase tracking-widest mb-2">VATwatchHQ</p>
              <h1 className="text-3xl font-bold text-white">Billing & Plans</h1>
              <p className="mt-1 text-slate-300 text-sm">{firmName}</p>
            </div>
            <Link href="/dashboard" className="rounded-xl px-4 py-2 text-sm font-semibold text-white border border-white/20 bg-white/10 hover:bg-white/20 transition-colors">
              ← Dashboard
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8">

        {message && (
          <div className={`mb-6 rounded-2xl p-4 text-sm border-l-4 transition-all duration-300 ${message.startsWith("✅") ? "bg-green-50 border-green-400 text-green-800" : message.startsWith("❌") ? "bg-red-50 border-red-400 text-red-800" : "bg-[#f2f7f8] border-[#c9af69] text-[#343b46]"}`}>
            {message}
          </div>
        )}

        {/* Current status — animated */}
        <div className="mb-8 rounded-2xl bg-white p-6 shadow-sm" style={{transition:"opacity 700ms ease 100ms, transform 700ms ease 100ms",opacity:visible?1:0,transform:visible?"translateY(0)":"translateY(16px)"}}>
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
                {subscriptionStatus === "trial"
                  ? `Free Trial${trialDaysLeft !== null ? ` — ${trialDaysLeft} days left` : ""}`
                  : subscriptionStatus.charAt(0).toUpperCase() + subscriptionStatus.slice(1)}
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

        {/* Plans heading */}
        <div className={`text-center mb-8 transition-all duration-700 delay-200 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <h2 className="text-2xl font-bold text-[#343b46]">
            {subscriptionStatus === "active" ? "Change Plan" : "Choose Your Plan"}
          </h2>
          <p className="text-slate-500 mt-2">Scale as your practice grows. Cancel anytime.</p>
        </div>

        {/* Plan cards — staggered animation */}
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 mb-8">
          {PLANS.map((plan, index) => {
            const isCurrent = currentPlan === plan.id;
            const delay = 200 + (index * 80);
            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl bg-white shadow-sm overflow-hidden transition-all duration-700 hover:shadow-lg hover:-translate-y-1 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"} ${plan.recommended ? "ring-2 ring-[#c9af69]" : ""} ${plan.popular ? "ring-2 ring-[#343b46]" : ""}`}
                style={{ transitionDelay: `${delay}ms` }}
              >
                {/* Top colour bar */}
                <div className="h-1.5 w-full" style={{ backgroundColor: plan.color }} />

                {plan.recommended && (
                  <div className="bg-[#c9af69] text-[#343b46] text-center text-xs font-bold py-1.5 uppercase tracking-wide animate-pulse">
                    ⭐ Most Popular
                  </div>
                )}
                {plan.popular && (
                  <div className="bg-[#343b46] text-white text-center text-xs font-bold py-1.5 uppercase tracking-wide">
                    🚀 Best Value
                  </div>
                )}

                <div className="p-5">
                  <h3 className="text-base font-bold text-[#343b46]">{plan.name}</h3>
                  <p className="text-xs text-slate-500 mb-3">{plan.clients}</p>

                  <div className="mb-1">
                    <span className="text-3xl font-bold text-[#343b46]">
                      {plan.price === 0 ? "Free" : `£${plan.price}`}
                    </span>
                    {plan.price > 0 && <span className="text-slate-400 text-xs">/month</span>}
                  </div>
                  <p className="text-xs text-slate-400 mb-4">{plan.perClient}</p>

                  <ul className="space-y-1.5 mb-5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-1.5 text-xs text-slate-600">
                        <span className="mt-0.5 flex-shrink-0" style={{ color: plan.color }}>✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <div className="w-full rounded-xl py-2.5 text-xs font-semibold text-center border-2" style={{ borderColor: plan.color, color: plan.color }}>
                      ✓ Current plan
                    </div>
                  ) : plan.price === 0 ? (
                    <button
                      onClick={() => startCheckout(plan)}
                      className="w-full rounded-xl py-2.5 text-xs font-semibold text-white transition-all hover:opacity-90 hover:scale-105"
                      style={{ backgroundColor: plan.color }}
                    >
                      Get started free
                    </button>
                  ) : (
                    <button
                      onClick={() => startCheckout(plan)}
                      disabled={checkoutLoading === plan.id}
                      className="w-full rounded-xl py-2.5 text-xs font-semibold text-white transition-all hover:opacity-90 hover:scale-105 disabled:opacity-50 active:scale-95"
                      style={{ backgroundColor: plan.color }}
                    >
                      {checkoutLoading === plan.id ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          Loading...
                        </span>
                      ) : subscriptionStatus === "active" ? `Switch to ${plan.name}` : `Start ${plan.name}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Per client comparison bar */}
        <div className={`mb-8 rounded-2xl bg-white p-6 shadow-sm transition-all duration-700 delay-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <h3 className="text-sm font-bold text-[#343b46] mb-4">Cost per client — the more clients, the better value</h3>
          <div className="space-y-3">
            {PLANS.filter(p => p.price > 0 && p.clientLimit).map((plan) => {
              const perClient = plan.price / (plan.clientLimit || 1);
              const maxPerClient = 9;
              const barWidth = Math.max(10, 100 - ((perClient / maxPerClient) * 100) + 10);
              return (
                <div key={plan.id} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-20 text-right">{plan.name}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all duration-1000"
                      style={{
                        width: visible ? `${barWidth}%` : "0%",
                        backgroundColor: plan.color,
                        transitionDelay: `${800 + PLANS.indexOf(plan) * 100}ms`
                      }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-600 w-24">£{perClient.toFixed(2)}/client</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer note */}
        <div className={`rounded-2xl bg-white p-5 text-sm text-slate-500 shadow-sm border-l-4 border-[#c9af69] transition-all duration-700 delay-1000 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <strong className="text-[#343b46]">🔒 Secure payments by Stripe.</strong> Cancel anytime — no long-term contracts. All plans include a 30-day free trial for new accounts. Prices exclude VAT.
        </div>

      </div>

      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

    </main>
  );
}
