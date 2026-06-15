// app/page.tsx
// VATwatchHQ landing page — replaces the default root route
// Target audience: UK accounting firms and unregistered business owners
// Single job: convert visitors to sign up for a free trial

"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);
  const [countValue, setCountValue] = useState(0);
  const featuresRef = useRef<HTMLDivElement>(null);
  const pricingRef = useRef<HTMLDivElement>(null);
  const [featuresVisible, setFeaturesVisible] = useState(false);
  const [pricingVisible, setPricingVisible] = useState(false);

  useEffect(() => {
    // Hero entrance
    setTimeout(() => setHeroVisible(true), 100);

    // Count up to 90,000
    let start = 0;
    const end = 90000;
    const duration = 2000;
    const steps = 60;
    const increment = end / steps;
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setCountValue(end);
        clearInterval(timer);
      } else {
        setCountValue(Math.floor(start));
      }
    }, duration / steps);

    // Scroll listener
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
      if (featuresRef.current) {
        const rect = featuresRef.current.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.8) setFeaturesVisible(true);
      }
      if (pricingRef.current) {
        const rect = pricingRef.current.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.8) setPricingVisible(true);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => { window.removeEventListener("scroll", handleScroll); clearInterval(timer); };
  }, []);

  const features = [
    { icon: "🔗", title: "Xero Connected", desc: "Pulls income data directly from Xero. No manual entry, no spreadsheets." },
    { icon: "📊", title: "Rolling 12-Month Watch", desc: "Monitors the exact window HMRC uses. Alerts trigger at 70%, 80%, 90% and 95% of threshold." },
    { icon: "📧", title: "Alerts to Accountant & Client", desc: "Both parties are notified automatically. No one is caught off guard." },
    { icon: "📄", title: "White-Label PDF Reports", desc: "Branded with your firm's logo and colours. Professional evidence for client files." },
    { icon: "🏢", title: "Multi-Client Dashboard", desc: "See every client's VAT position at a glance. Act before thresholds are breached." },
    { icon: "🔒", title: "6-Year Data Retention", desc: "Archived client records kept for 6 years in line with Companies Act requirements." },
  ];

  const plans = [
    { name: "Solo", price: 9, clients: "1 business", color: "#0891b2", desc: "For business owners monitoring their own VAT position" },
    { name: "Starter", price: 29, clients: "10 clients", color: "#7c3aed", desc: "For small practices getting started" },
    { name: "Growth", price: 49, clients: "20 clients", color: "#c9af69", desc: "For growing practices", popular: true },
    { name: "Unlimited", price: 99, clients: "Unlimited", color: "#343b46", desc: "For established practices" },
  ];

  return (
    <main style={{ fontFamily: "'Open Sans', Arial, sans-serif", backgroundColor: "#f2f7f8", overflowX: "hidden" }}>

      {/* Sticky nav */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        backgroundColor: scrolled ? "rgba(52,59,70,0.97)" : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        transition: "background-color 300ms ease, box-shadow 300ms ease",
        boxShadow: scrolled ? "0 2px 20px rgba(0,0,0,0.2)" : "none",
        padding: "16px 24px",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#c9af69", fontWeight: 800, fontSize: 20, letterSpacing: -0.5 }}>VAT</span>
            <span style={{ color: "white", fontWeight: 800, fontSize: 20, letterSpacing: -0.5 }}>watchHQ</span>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <a href="#features" style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, textDecoration: "none" }}>Features</a>
            <a href="#pricing" style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, textDecoration: "none" }}>Pricing</a>
            <Link href="/dashboard" style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, textDecoration: "none" }}>Sign in</Link>
            <Link href="/signup" style={{
              backgroundColor: "#c9af69", color: "#343b46", fontSize: 14, fontWeight: 700,
              padding: "8px 20px", borderRadius: 10, textDecoration: "none",
              transition: "transform 200ms, box-shadow 200ms",
            }}>
              Start free trial
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        background: "linear-gradient(135deg, #1e242d 0%, #343b46 50%, #2a303a 100%)",
        minHeight: "100vh", display: "flex", alignItems: "center",
        padding: "120px 24px 80px",
        position: "relative", overflow: "hidden",
      }}>
        {/* Background decoration */}
        <div style={{
          position: "absolute", top: "10%", right: "5%",
          width: 400, height: 400, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(201,175,105,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: "10%", left: "5%",
          width: 300, height: 300, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(201,175,105,0.05) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>

            {/* Left — copy */}
            <div style={{
              transition: "opacity 800ms ease, transform 800ms ease",
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? "translateX(0)" : "translateX(-32px)",
            }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                backgroundColor: "rgba(201,175,105,0.15)", borderRadius: 20,
                padding: "6px 16px", marginBottom: 24,
                border: "1px solid rgba(201,175,105,0.3)",
              }}>
                <span style={{ color: "#c9af69", fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
                  For UK Accounting Firms
                </span>
              </div>

              <h1 style={{ color: "white", fontSize: 52, fontWeight: 800, lineHeight: 1.1, marginBottom: 24, letterSpacing: -1 }}>
                Never miss a<br />
                <span style={{ color: "#c9af69" }}>VAT registration</span><br />
                deadline again
              </h1>

              <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 18, lineHeight: 1.7, marginBottom: 40, maxWidth: 480 }}>
                VATwatchHQ monitors every client's rolling 12-month turnover against the £90,000 threshold — automatically. Get alerted before it's too late.
              </p>

              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <Link href="/signup" style={{
                  backgroundColor: "#c9af69", color: "#343b46",
                  fontWeight: 700, fontSize: 16, padding: "16px 32px",
                  borderRadius: 12, textDecoration: "none",
                  display: "inline-block",
                  boxShadow: "0 8px 24px rgba(201,175,105,0.3)",
                  transition: "transform 200ms, box-shadow 200ms",
                }}>
                  Start free 30-day trial →
                </Link>
                <a href="#features" style={{
                  color: "white", fontWeight: 600, fontSize: 16,
                  padding: "16px 32px", borderRadius: 12, textDecoration: "none",
                  border: "1px solid rgba(255,255,255,0.2)",
                  display: "inline-block",
                }}>
                  See how it works
                </a>
              </div>

              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 20 }}>
                No credit card required · Cancel anytime · Xero connected
              </p>
            </div>

            {/* Right — animated threshold gauge */}
            <div style={{
              transition: "opacity 800ms ease 300ms, transform 800ms ease 300ms",
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? "translateX(0)" : "translateX(32px)",
            }}>
              <div style={{
                backgroundColor: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 20, padding: 32,
                backdropFilter: "blur(10px)",
              }}>
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                  VAT Registration Threshold
                </p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 24 }}>
                  <span style={{ color: "#c9af69", fontSize: 48, fontWeight: 800 }}>
                    £{countValue.toLocaleString()}
                  </span>
                </div>

                {/* Mock client list */}
                {[
                  { name: "BMA Leisure Ltd", percent: 79, risk: "Watch", color: "#2563eb" },
                  { name: "Smith Retail Co", percent: 91, risk: "High Risk", color: "#ea580c" },
                  { name: "Green Gardens", percent: 45, risk: "Low Risk", color: "#16a34a" },
                  { name: "Metro Coffee Ltd", percent: 97, risk: "Critical", color: "#dc2626" },
                ].map((client, i) => (
                  <div key={client.name} style={{
                    marginBottom: 16,
                    transition: `opacity 600ms ease ${400 + i * 150}ms, transform 600ms ease ${400 + i * 150}ms`,
                    opacity: heroVisible ? 1 : 0,
                    transform: heroVisible ? "translateX(0)" : "translateX(16px)",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ color: "white", fontSize: 13, fontWeight: 500 }}>{client.name}</span>
                      <span style={{ color: client.color, fontSize: 12, fontWeight: 700 }}>{client.risk}</span>
                    </div>
                    <div style={{ backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                      <div style={{
                        height: 6, borderRadius: 4,
                        backgroundColor: client.color,
                        width: heroVisible ? `${client.percent}%` : "0%",
                        transition: `width 1000ms ease ${600 + i * 150}ms`,
                      }} />
                    </div>
                    <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 4 }}>{client.percent}% of £90,000</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section style={{ backgroundColor: "#343b46", padding: "24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "center", gap: 64, flexWrap: "wrap" }}>
          {[
            { value: "£90,000", label: "VAT threshold" },
            { value: "30 days", label: "Registration deadline" },
            { value: "100%", label: "Xero accurate" },
            { value: "6 years", label: "Data retention" },
          ].map((stat) => (
            <div key={stat.label} style={{ textAlign: "center" }}>
              <p style={{ color: "#c9af69", fontSize: 24, fontWeight: 800, margin: 0 }}>{stat.value}</p>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, margin: "4px 0 0 0" }}>{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" ref={featuresRef} style={{ padding: "100px 24px", backgroundColor: "#f2f7f8" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <p style={{ color: "#c9af69", fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
              Everything you need
            </p>
            <h2 style={{ color: "#343b46", fontSize: 40, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
              Built for UK accountants
            </h2>
            <p style={{ color: "#6b7280", fontSize: 18, marginTop: 16, maxWidth: 500, marginLeft: "auto", marginRight: "auto" }}>
              Every feature designed around how accounting firms actually work.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {features.map((feature, i) => (
              <div key={feature.title} style={{
                backgroundColor: "white", borderRadius: 16, padding: 28,
                boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                transition: `opacity 600ms ease ${i * 100}ms, transform 600ms ease ${i * 100}ms`,
                opacity: featuresVisible ? 1 : 0,
                transform: featuresVisible ? "translateY(0)" : "translateY(24px)",
                borderTop: `3px solid #c9af69`,
              }}>
                <div style={{ fontSize: 32, marginBottom: 16 }}>{feature.icon}</div>
                <h3 style={{ color: "#343b46", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{feature.title}</h3>
                <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6, margin: 0 }}>{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" ref={pricingRef} style={{ padding: "100px 24px", backgroundColor: "#343b46" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <p style={{ color: "#c9af69", fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
              Simple pricing
            </p>
            <h2 style={{ color: "white", fontSize: 40, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
              Scale as you grow
            </h2>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 18, marginTop: 16 }}>
              Start free. Upgrade when you're ready.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
            {plans.map((plan, i) => (
              <div key={plan.name} style={{
                backgroundColor: plan.popular ? "#c9af69" : "rgba(255,255,255,0.05)",
                border: `1px solid ${plan.popular ? "#c9af69" : "rgba(255,255,255,0.1)"}`,
                borderRadius: 16, padding: 28, position: "relative",
                transition: `opacity 600ms ease ${i * 120}ms, transform 600ms ease ${i * 120}ms`,
                opacity: pricingVisible ? 1 : 0,
                transform: pricingVisible ? "translateY(0)" : "translateY(24px)",
              }}>
                {plan.popular && (
                  <div style={{
                    position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
                    backgroundColor: "#343b46", color: "#c9af69",
                    fontSize: 11, fontWeight: 700, padding: "4px 16px",
                    borderRadius: 20, border: "1px solid #c9af69",
                    whiteSpace: "nowrap",
                  }}>
                    ⭐ Most Popular
                  </div>
                )}
                <h3 style={{ color: plan.popular ? "#343b46" : "white", fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{plan.name}</h3>
                <p style={{ color: plan.popular ? "rgba(52,59,70,0.7)" : "rgba(255,255,255,0.5)", fontSize: 12, marginBottom: 20 }}>{plan.desc}</p>
                <div style={{ marginBottom: 20 }}>
                  <span style={{ color: plan.popular ? "#343b46" : "white", fontSize: 36, fontWeight: 800 }}>£{plan.price}</span>
                  <span style={{ color: plan.popular ? "rgba(52,59,70,0.6)" : "rgba(255,255,255,0.4)", fontSize: 13 }}>/month</span>
                </div>
                <p style={{ color: plan.popular ? "rgba(52,59,70,0.7)" : "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 24 }}>
                  {plan.clients}
                </p>
                <Link href="/signup" style={{
                  display: "block", textAlign: "center",
                  backgroundColor: plan.popular ? "#343b46" : "rgba(255,255,255,0.1)",
                  color: plan.popular ? "#c9af69" : "white",
                  fontWeight: 700, fontSize: 14, padding: "12px 24px",
                  borderRadius: 10, textDecoration: "none",
                  border: plan.popular ? "none" : "1px solid rgba(255,255,255,0.2)",
                }}>
                  Start free trial →
                </Link>
              </div>
            ))}
          </div>

          <p style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13, marginTop: 32 }}>
            All plans include a 30-day free trial. No credit card required. Prices exclude VAT.
            <Link href="/billing" style={{ color: "#c9af69", marginLeft: 8, textDecoration: "none" }}>See full pricing →</Link>
          </p>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "100px 24px", backgroundColor: "#f2f7f8", textAlign: "center" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <h2 style={{ color: "#343b46", fontSize: 40, fontWeight: 800, marginBottom: 20, letterSpacing: -0.5 }}>
            Ready to protect your clients?
          </h2>
          <p style={{ color: "#6b7280", fontSize: 18, lineHeight: 1.7, marginBottom: 40 }}>
            Join accounting firms already using VATwatchHQ to monitor VAT thresholds automatically. Start your free 30-day trial today.
          </p>
          <Link href="/signup" style={{
            backgroundColor: "#343b46", color: "white",
            fontWeight: 700, fontSize: 18, padding: "20px 48px",
            borderRadius: 14, textDecoration: "none",
            display: "inline-block",
            boxShadow: "0 8px 32px rgba(52,59,70,0.2)",
          }}>
            Start free trial — no card needed →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ backgroundColor: "#343b46", padding: "40px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
              <span style={{ color: "#c9af69", fontWeight: 800, fontSize: 16 }}>VAT</span>
              <span style={{ color: "white", fontWeight: 800, fontSize: 16 }}>watchHQ</span>
            </div>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: 0 }}>
              Powered by Maddock & Co. UK Ltd
            </p>
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <Link href="/terms" style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textDecoration: "none" }}>Terms</Link>
            <Link href="/privacy" style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textDecoration: "none" }}>Privacy</Link>
            <a href="https://www.maddockandco.com" style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textDecoration: "none" }}>maddockandco.com</a>
            <Link href="/dashboard" style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textDecoration: "none" }}>Sign in</Link>
          </div>
        </div>
      </footer>

    </main>
  );
}
