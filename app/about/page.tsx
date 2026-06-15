// app/about/page.tsx
// About VATwatchHQ — company story, mission, team

"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

export default function AboutPage() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);
  }, []);

  return (
    <main className="min-h-screen bg-[#f2f7f8]" style={{ fontFamily: "'Open Sans', sans-serif" }}>

      {/* Nav */}
      <nav className="bg-[#343b46] px-6 py-5">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1 no-underline">
            <span className="text-[#c9af69] font-bold text-xl">VAT</span>
            <span className="text-white font-bold text-xl">watchHQ</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/pricing" className="text-slate-300 text-sm hover:text-white transition-colors">Pricing</Link>
            <Link href="/about" className="text-white text-sm font-semibold">About</Link>
            <Link href="/dashboard" className="text-slate-300 text-sm hover:text-white transition-colors">Sign in</Link>
            <Link href="/signup" className="rounded-xl bg-[#c9af69] px-4 py-2 text-sm font-bold text-[#343b46] hover:bg-[#b89d58] transition-colors">
              Start free trial
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-[#343b46] px-6 pb-16 pt-12">
        <div className="mx-auto max-w-4xl text-center"
          style={{
            transition: "opacity 700ms ease, transform 700ms ease",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(20px)",
          }}
        >
          <p className="text-xs text-[#c9af69] font-bold uppercase tracking-widest mb-4">Our story</p>
          <h1 className="text-4xl font-bold text-white mb-6 leading-tight">
            Built by accountants,<br />for accountants
          </h1>
          <p className="text-slate-300 text-lg max-w-2xl mx-auto leading-relaxed">
            VATwatchHQ was born from a real problem — manually tracking dozens of clients' VAT positions every month was time-consuming, error-prone and frankly not something any accountant should be doing in 2026.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-6 py-16">

        {/* The problem */}
        <div className="mb-16"
          style={{
            transition: "opacity 700ms ease 200ms, transform 700ms ease 200ms",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(20px)",
          }}
        >
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs text-[#c9af69] font-bold uppercase tracking-widest mb-3">The problem</p>
              <h2 className="text-2xl font-bold text-[#343b46] mb-4">Missing a VAT registration deadline is costly</h2>
              <p className="text-slate-600 leading-relaxed mb-4">
                If a client exceeds the £90,000 VAT threshold without registering, HMRC can charge penalties from the date they should have registered — not the date they actually did. That can mean thousands of pounds in backdated VAT and penalties.
              </p>
              <p className="text-slate-600 leading-relaxed">
                Most accounting software doesn't monitor this automatically. It falls to accountants to manually check client turnover every month — or worse, wait until year-end when it's too late.
              </p>
            </div>
            <div className="rounded-2xl bg-[#343b46] p-6 text-white">
              <h3 className="text-lg font-bold mb-4 text-[#c9af69]">The VAT registration rules</h3>
              {[
                { rule: "Rolling 12-month window", desc: "Not calendar year — any 12-month period" },
                { rule: "£90,000 threshold", desc: "Current HMRC registration threshold" },
                { rule: "30-day registration deadline", desc: "Once exceeded, 30 days to register" },
                { rule: "Backdated liability", desc: "HMRC charges from breach date, not registration" },
              ].map((item) => (
                <div key={item.rule} className="mb-4 last:mb-0 border-b border-white/10 pb-4 last:border-0 last:pb-0">
                  <p className="font-semibold text-sm">{item.rule}</p>
                  <p className="text-slate-300 text-xs mt-1">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* The solution */}
        <div className="mb-16 rounded-2xl bg-white p-10 shadow-sm">
          <p className="text-xs text-[#c9af69] font-bold uppercase tracking-widest mb-3">The solution</p>
          <h2 className="text-2xl font-bold text-[#343b46] mb-4">Automated monitoring — so nothing slips through</h2>
          <p className="text-slate-600 leading-relaxed mb-8">
            VATwatchHQ connects directly to Xero and automatically monitors every client's rolling 12-month taxable turnover against the HMRC threshold. When a client approaches the threshold, both you and the client are notified — automatically, every month.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { step: "01", title: "Connect Xero", desc: "One-click OAuth connection. No spreadsheets, no manual entry." },
              { step: "02", title: "Auto-monitor", desc: "Every month we pull the latest figures and calculate the rolling position." },
              { step: "03", title: "Get alerted", desc: "Automatic emails at 70%, 80%, 90% and 95% of threshold." },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-12 h-12 rounded-full bg-[#343b46] text-[#c9af69] font-bold text-lg flex items-center justify-center mx-auto mb-3">
                  {item.step}
                </div>
                <h3 className="font-bold text-[#343b46] mb-2">{item.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* About Maddock & Co */}
        <div className="mb-16">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="rounded-2xl bg-[#c9af69]/10 border border-[#c9af69]/30 p-8">
              <p className="text-xs text-[#c9af69] font-bold uppercase tracking-widest mb-3">Powered by</p>
              <h3 className="text-xl font-bold text-[#343b46] mb-4">Maddock & Co. UK Ltd</h3>
              <p className="text-slate-600 text-sm leading-relaxed mb-4">
                Maddock & Co. is a UK accounting practice with 20+ years of hands-on experience helping businesses with their accounting, tax and compliance needs.
              </p>
              <p className="text-slate-600 text-sm leading-relaxed mb-4">
                VATwatchHQ was built from our own frustration with manually tracking VAT thresholds for our clients. We built the tool we wished existed — and now we're making it available to every accounting firm in the UK.
              </p>
              <a href="https://www.maddockandco.com" target="_blank" rel="noopener noreferrer"
                className="text-[#343b46] font-semibold text-sm hover:text-[#c9af69] transition-colors">
                Visit maddockandco.com →
              </a>
            </div>
            <div>
              <p className="text-xs text-[#c9af69] font-bold uppercase tracking-widest mb-3">Our values</p>
              <h2 className="text-2xl font-bold text-[#343b46] mb-6">Built on trust and accuracy</h2>
              {[
                { icon: "🎯", title: "100% accuracy", desc: "Our Xero import reconciles to the penny against the Xero P&L. We don't round, estimate or approximate." },
                { icon: "🔒", title: "Your data stays yours", desc: "Each firm's data is completely isolated. We never share or use client data for any other purpose." },
                { icon: "🤝", title: "Built for accountants", desc: "Every feature is designed around how accounting firms actually work — not how software engineers think they work." },
              ].map((item) => (
                <div key={item.title} className="flex gap-4 mb-6 last:mb-0">
                  <span className="text-2xl mt-1">{item.icon}</span>
                  <div>
                    <h3 className="font-bold text-[#343b46] mb-1">{item.title}</h3>
                    <p className="text-slate-500 text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Coming soon */}
        <div className="mb-16 rounded-2xl bg-white p-8 shadow-sm">
          <p className="text-xs text-[#c9af69] font-bold uppercase tracking-widest mb-3">What's coming</p>
          <h2 className="text-2xl font-bold text-[#343b46] mb-6">The roadmap</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { status: "✅ Live", item: "Xero integration", colour: "bg-green-100 text-green-700" },
              { status: "✅ Live", item: "Automated monthly monitoring", colour: "bg-green-100 text-green-700" },
              { status: "✅ Live", item: "White-label PDF reports", colour: "bg-green-100 text-green-700" },
              { status: "✅ Live", item: "Email alerts", colour: "bg-green-100 text-green-700" },
              { status: "🔜 Coming soon", item: "QuickBooks integration", colour: "bg-blue-100 text-blue-700" },
              { status: "🔜 Coming soon", item: "FreeAgent integration", colour: "bg-blue-100 text-blue-700" },
              { status: "🔜 Coming soon", item: "Sage integration", colour: "bg-blue-100 text-blue-700" },
              { status: "🔮 Future", item: "CRM with AML checks", colour: "bg-purple-100 text-purple-700" },
            ].map((item) => (
              <div key={item.item} className="flex items-center gap-3 p-3 rounded-xl bg-[#f2f7f8]">
                <span className={`rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap ${item.colour}`}>{item.status}</span>
                <span className="text-sm text-[#343b46] font-medium">{item.item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="rounded-2xl bg-[#343b46] p-10 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">Ready to automate your VAT monitoring?</h2>
          <p className="text-slate-300 text-sm mb-6">30-day free trial. No credit card required. Cancel anytime.</p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/signup" className="rounded-xl bg-[#c9af69] px-8 py-4 text-sm font-bold text-[#343b46] hover:bg-[#b89d58] transition-colors">
              Start free trial →
            </Link>
            <Link href="/pricing" className="rounded-xl border border-white/20 px-8 py-4 text-sm font-bold text-white hover:bg-white/10 transition-colors">
              See pricing
            </Link>
          </div>
        </div>

      </div>

      {/* Footer */}
      <footer className="bg-[#343b46] px-6 py-8">
        <div className="mx-auto max-w-6xl flex justify-between items-center flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-1 mb-1">
              <span className="text-[#c9af69] font-bold text-base">VAT</span>
              <span className="text-white font-bold text-base">watchHQ</span>
            </div>
            <p className="text-slate-400 text-xs">Powered by Maddock & Co. UK Ltd</p>
          </div>
          <div className="flex gap-6 flex-wrap">
            <Link href="/" className="text-slate-400 text-sm hover:text-white">Home</Link>
            <Link href="/pricing" className="text-slate-400 text-sm hover:text-white">Pricing</Link>
            <Link href="/about" className="text-slate-400 text-sm hover:text-white">About</Link>
            <Link href="/terms" className="text-slate-400 text-sm hover:text-white">Terms</Link>
            <Link href="/privacy" className="text-slate-400 text-sm hover:text-white">Privacy</Link>
            <Link href="/dashboard" className="text-slate-400 text-sm hover:text-white">Sign in</Link>
          </div>
        </div>
      </footer>

    </main>
  );
}
