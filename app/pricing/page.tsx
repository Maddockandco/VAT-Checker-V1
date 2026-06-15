// app/pricing/page.tsx
// Public pricing page — no auth required
// Shows all 7 plans with animations

"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    clients: "1 business",
    perClient: "Free forever",
    color: "#6b7280",
    desc: "For business owners who want to monitor their own VAT position manually",
    features: ["1 business monitored", "Manual data entry", "Basic threshold gauge", "VAT risk status"],
  },
  {
    id: "solo",
    name: "Solo",
    price: 9,
    clients: "1 business",
    perClient: "£9.00 per business",
    color: "#0891b2",
    desc: "For business owners connected to Xero",
    features: ["1 business monitored", "Xero integration", "Automated monthly imports", "Email alerts", "PDF reports"],
  },
  {
    id: "starter",
    name: "Starter",
    price: 29,
    clients: "Up to 10 clients",
    perClient: "£2.90 per client",
    color: "#7c3aed",
    desc: "For small accounting practices",
    features: ["Up to 10 monitored clients", "Xero integration", "Automated imports", "Email alerts to accountant & client", "White-label PDF reports", "6-year data retention"],
  },
  {
    id: "growth",
    name: "Growth",
    price: 49,
    clients: "Up to 20 clients",
    perClient: "£2.45 per client",
    color: "#c9af69",
    desc: "For growing practices",
    recommended: true,
    features: ["Up to 20 monitored clients", "Everything in Starter", "Priority email support", "Advanced risk reporting", "Custom firm branding"],
  },
  {
    id: "growth_pro",
    name: "Growth Pro",
    price: 64,
    clients: "Up to 30 clients",
    perClient: "£2.13 per client",
    color: "#ea580c",
    desc: "For established practices",
    features: ["Up to 30 monitored clients", "Everything in Growth", "Dedicated account manager", "Bulk import tools", "Advanced analytics"],
  },
  {
    id: "growth_max",
    name: "Growth Max",
    price: 74,
    clients: "Up to 40 clients",
    perClient: "£1.85 per client",
    color: "#dc2626",
    desc: "For large practices",
    features: ["Up to 40 monitored clients", "Everything in Growth Pro", "API access", "Custom integrations", "Priority SLA"],
  },
  {
    id: "unlimited",
    name: "Unlimited",
    price: 99,
    clients: "Unlimited clients",
    perClient: "< £1 per client at 100+",
    color: "#343b46",
    desc: "For large practices with no limits",
    popular: true,
    features: ["Unlimited monitored clients", "Everything in Growth Max", "White-label platform", "Multi-user firm access", "SLA guarantee"],
  },
];

export default function PricingPage() {
  const [visible, setVisible] = useState(false);
  const [barsVisible, setBarsVisible] = useState(false);
  const [countedPrices, setCountedPrices] = useState<Record<string, number>>({});
  const barsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);

    // Count up prices
    PLANS.forEach((plan) => {
      if (plan.price === 0) return;
      let start = 0;
      const end = plan.price;
      const steps = 30;
      const increment = end / steps;
      const timer = setInterval(() => {
        start += increment;
        if (start >= end) {
          setCountedPrices(prev => ({ ...prev, [plan.id]: end }));
          clearInterval(timer);
        } else {
          setCountedPrices(prev => ({ ...prev, [plan.id]: Math.floor(start) }));
        }
      }, 1200 / steps);
    });

    // Bars on scroll
    const handleScroll = () => {
      if (barsRef.current) {
        const rect = barsRef.current.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.8) setBarsVisible(true);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <main className="min-h-screen bg-[#f2f7f8]" style={{ fontFamily: "'Open Sans', sans-serif" }}>

      {/* Header */}
      <div className="bg-[#343b46] px-6 py-8">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1 no-underline">
            <span className="text-[#c9af69] font-bold text-xl">VAT</span>
            <span className="text-white font-bold text-xl">watchHQ</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-slate-300 text-sm hover:text-white transition-colors">Sign in</Link>
            <Link href="/signup" className="rounded-xl bg-[#c9af69] px-4 py-2 text-sm font-bold text-[#343b46] hover:bg-[#b89d58] transition-colors">
              Start free trial
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-12">

        {/* Heading */}
        <div
          className="text-center mb-12"
          style={{
            transition: "opacity 700ms ease, transform 700ms ease",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(20px)",
          }}
        >
          <p className="text-xs text-[#c9af69] font-bold uppercase tracking-widest mb-3">Simple, transparent pricing</p>
          <h1 className="text-4xl font-bold text-[#343b46] mb-4">Scale as your practice grows</h1>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">Start free. No credit card required. Cancel anytime.</p>
        </div>

        {/* Plan cards */}
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 mb-12">
          {PLANS.map((plan, index) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl bg-white shadow-sm overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all ${plan.recommended ? "ring-2 ring-[#c9af69]" : ""} ${plan.popular ? "ring-2 ring-[#343b46]" : ""}`}
              style={{
                transition: `opacity 600ms ease ${index * 80}ms, transform 600ms ease ${index * 80}ms, box-shadow 200ms, translate 200ms`,
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(24px)",
              }}
            >
              <div className="h-1.5 w-full" style={{ backgroundColor: plan.color }} />
              {plan.recommended && (
                <div className="bg-[#c9af69] text-[#343b46] text-center text-xs font-bold py-1.5 uppercase tracking-wide">
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
                <p className="text-xs text-slate-500 mb-1">{plan.clients}</p>
                <p className="text-xs text-slate-400 mb-3 leading-relaxed">{plan.desc}</p>
                <div className="mb-1">
                  <span className="text-3xl font-bold text-[#343b46]">
                    {plan.price === 0 ? "Free" : `£${countedPrices[plan.id] ?? plan.price}`}
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
                <Link
                  href="/signup"
                  className="block w-full rounded-xl py-2.5 text-xs font-bold text-white text-center transition-all hover:opacity-90 hover:scale-105 active:scale-95"
                  style={{ backgroundColor: plan.color }}
                >
                  {plan.price === 0 ? "Get started free" : "Start free trial →"}
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Per client value bars */}
        <div ref={barsRef} className="rounded-2xl bg-white p-6 shadow-sm mb-12">
          <h3 className="text-sm font-bold text-[#343b46] mb-2">Cost per client — better value as you grow</h3>
          <p className="text-xs text-slate-400 mb-6">The more clients you monitor, the less you pay per client.</p>
          <div className="space-y-3">
            {PLANS.filter(p => p.price > 0 && p.clients !== "Unlimited clients").map((plan, i) => {
              const clientLimit = parseInt(plan.clients.replace(/\D/g, "")) || 1;
              const perClient = plan.price / clientLimit;
              const barWidth = Math.max(15, 100 - ((perClient / 9) * 85));
              return (
                <div key={plan.id} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-24 text-right font-medium">{plan.name}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-3 rounded-full"
                      style={{
                        width: barsVisible ? `${barWidth}%` : "0%",
                        backgroundColor: plan.color,
                        transition: `width 1000ms ease ${i * 120}ms`,
                      }}
                    />
                  </div>
                  <span className="text-xs font-semibold w-28" style={{ color: plan.color }}>
                    £{perClient.toFixed(2)}/client
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* FAQ */}
        <div className="rounded-2xl bg-white p-8 shadow-sm mb-12">
          <h2 className="text-xl font-bold text-[#343b46] mb-6">Common questions</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {[
              { q: "Do I need a credit card to start?", a: "No — your 30-day free trial starts immediately with no card required. You only need to add payment details if you choose to continue." },
              { q: "Can I change plans anytime?", a: "Yes — upgrade or downgrade at any time. Changes take effect immediately and billing is prorated." },
              { q: "What happens to my data if I cancel?", a: "Your data is retained for 30 days after cancellation so you can export anything you need. Archived clients are kept for 6 years." },
              { q: "Does it work with Xero?", a: "Yes — VATwatchHQ connects directly to Xero via OAuth and pulls income data automatically every month." },
              { q: "Who is the Free plan for?", a: "The Free plan is for individual business owners who want to manually track their own VAT position without a Xero connection." },
              { q: "What is the VAT threshold?", a: "The current UK VAT registration threshold is £90,000 in any rolling 12-month period. VATwatchHQ monitors this continuously." },
            ].map((faq) => (
              <div key={faq.q}>
                <h3 className="text-sm font-bold text-[#343b46] mb-2">{faq.q}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="rounded-2xl bg-[#343b46] p-10 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">Ready to get started?</h2>
          <p className="text-slate-300 text-sm mb-6">30-day free trial. No credit card. Cancel anytime.</p>
          <Link href="/signup" className="inline-block rounded-xl bg-[#c9af69] px-8 py-4 text-sm font-bold text-[#343b46] hover:bg-[#b89d58] transition-colors">
            Start your free trial →
          </Link>
        </div>

      </div>

      {/* Footer */}
      <footer className="bg-[#343b46] px-6 py-8 mt-12">
        <div className="mx-auto max-w-6xl flex justify-between items-center flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-1 mb-1">
              <span className="text-[#c9af69] font-bold text-base">VAT</span>
              <span className="text-white font-bold text-base">watchHQ</span>
            </div>
            <p className="text-slate-400 text-xs">Powered by Maddock & Co. UK Ltd</p>
          </div>
          <div className="flex gap-6">
            <Link href="/" className="text-slate-400 text-sm hover:text-white">Home</Link>
            <Link href="/terms" className="text-slate-400 text-sm hover:text-white">Terms</Link>
            <Link href="/privacy" className="text-slate-400 text-sm hover:text-white">Privacy</Link>
            <Link href="/dashboard" className="text-slate-400 text-sm hover:text-white">Sign in</Link>
          </div>
        </div>
      </footer>

    </main>
  );
}
