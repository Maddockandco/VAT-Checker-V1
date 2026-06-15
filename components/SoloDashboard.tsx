// components/SoloDashboard.tsx
// Simplified dashboard for Solo and Free plan users
// Shows their own business VAT position only — no multi-client view

"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const VAT_THRESHOLD = 90000;

type MonthRow = {
  month: string;
  standard: number;
  reduced: number;
  zero: number;
  exempt: number;
  out: number;
};

type VatField = "standard" | "reduced" | "zero" | "exempt" | "out";

function getLastCompleted12Months(): MonthRow[] {
  const months: MonthRow[] = [];
  const today = new Date();
  const endMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(endMonth.getFullYear(), endMonth.getMonth() - i, 1);
    months.push({
      month: d.toLocaleString("en-GB", { month: "short", year: "numeric" }),
      standard: 0, reduced: 0, zero: 0, exempt: 0, out: 0,
    });
  }
  return months;
}

function getRiskStatus(turnover: number) {
  if (turnover >= VAT_THRESHOLD) return { status: "Registration Required", colour: "#dc2626", bg: "#fef2f2", border: "#fecaca" };
  if (turnover >= VAT_THRESHOLD * 0.95) return { status: "Critical", colour: "#dc2626", bg: "#fef2f2", border: "#fecaca" };
  if (turnover >= VAT_THRESHOLD * 0.90) return { status: "High Risk", colour: "#ea580c", bg: "#fff7ed", border: "#fed7aa" };
  if (turnover >= VAT_THRESHOLD * 0.80) return { status: "Warning", colour: "#ca8a04", bg: "#fefce8", border: "#fde68a" };
  if (turnover >= VAT_THRESHOLD * 0.70) return { status: "Watch", colour: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" };
  return { status: "Low Risk", colour: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" };
}

type SoloDashboardProps = {
  userId: string;
  firmId: string;
  userEmail: string;
  plan: string;
  onSignOut: () => void;
};

export default function SoloDashboard({ userId, firmId, userEmail, plan, onSignOut }: SoloDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [businessName, setBusinessName] = useState("");
  const [sector, setSector] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [months, setMonths] = useState<MonthRow[]>(getLastCompleted12Months());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [xeroConnected, setXeroConnected] = useState(false);
  const [importing, setImporting] = useState(false);
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);

  const rollingTurnover = months.reduce((sum, m) => sum + m.standard + m.reduced + m.zero, 0);
  const thresholdPercent = (rollingTurnover / VAT_THRESHOLD) * 100;
  const remaining = Math.max(0, VAT_THRESHOLD - rollingTurnover);
  const risk = getRiskStatus(rollingTurnover);
  const progressWidth = Math.min(Math.round(thresholdPercent), 100);
  const isFree = plan === "free" || plan === null;
  const rollingPeriod = months.length > 0 ? `${months[0].month} – ${months[months.length - 1].month}` : "";

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    if (!supabase) return;
    setLoading(true);

    // Get firm trial info
    const { data: firm } = await supabase
      .from("firms")
      .select("trial_ends_at,name")
      .eq("id", firmId)
      .single();

    if (firm?.trial_ends_at) {
      const days = Math.ceil((new Date(firm.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      setTrialDaysLeft(days > 0 ? days : 0);
    }

    // Get or create the solo client
    const { data: clients } = await supabase
      .from("clients")
      .select("id,name,sector")
      .eq("firm_id", firmId)
      .eq("archived", false)
      .limit(1);

    let soloClientId = clients?.[0]?.id || null;

    if (!soloClientId) {
      // Create a default client for this solo user
      const { data: newClient } = await supabase
        .from("clients")
        .insert({ name: firm?.name || "My Business", firm_id: firmId })
        .select()
        .single();
      soloClientId = newClient?.id || null;
    }

    if (soloClientId) {
      setClientId(soloClientId);
      setBusinessName(clients?.[0]?.name || firm?.name || "My Business");
      setSector(clients?.[0]?.sector || "");

      // Load turnover entries
      const { data: entries } = await supabase
        .from("turnover_entries")
        .select("month_label,standard_rated,reduced_rated,zero_rated,exempt,out_of_scope,source")
        .eq("client_id", soloClientId);

      const baseMonths = getLastCompleted12Months();
      const loaded = baseMonths.map((month) => {
        const xeroEntry = entries?.find((e) => e.month_label === month.month && e.source === "xero");
        const manualEntry = entries?.find((e) => e.month_label === month.month && e.source === "manual");
        const match = xeroEntry || manualEntry;
        return {
          month: month.month,
          standard: Number(match?.standard_rated || 0),
          reduced: Number(match?.reduced_rated || 0),
          zero: Number(match?.zero_rated || 0),
          exempt: Number(match?.exempt || 0),
          out: Number(match?.out_of_scope || 0),
        };
      });
      setMonths(loaded);

      // Check Xero connection
      const { data: conn } = await supabase
        .from("accounting_connections")
        .select("id")
        .eq("client_id", soloClientId)
        .eq("provider", "xero")
        .limit(1)
        .single();
      setXeroConnected(!!conn);
    }

    setLoading(false);
  }

  function updateValue(index: number, field: VatField, value: number) {
    const updated = [...months];
    updated[index] = { ...updated[index], [field]: value };
    setMonths(updated);
  }

  async function saveData() {
    if (!supabase || !clientId) return;
    setSaving(true);
    setMessage("");

    // Update client name
    await supabase.from("clients").update({ name: businessName, sector }).eq("id", clientId);

    // Save turnover entries
    await supabase.from("turnover_entries").delete().eq("client_id", clientId).neq("source", "xero");

    const entries = months.map((m) => ({
      client_id: clientId,
      month_label: m.month,
      standard_rated: m.standard,
      reduced_rated: m.reduced,
      zero_rated: m.zero,
      exempt: m.exempt,
      out_of_scope: m.out,
      source: "manual",
    }));
    await supabase.from("turnover_entries").upsert(entries, { onConflict: "client_id,month_label,source" });

    // Save VAT review
    await supabase.from("vat_reviews").insert({
      client_id: clientId,
      rolling_taxable_turnover: Number(rollingTurnover.toFixed(2)),
      expected_next_30_days: 0,
      risk_status: risk.status,
    });

    setMessage("✅ Saved successfully!");
    setSaving(false);
  }

  async function connectXero() {
    if (!clientId) return;
    window.location.href = `/api/xero/connect?clientId=${clientId}`;
  }

  async function importFromXero() {
    if (!clientId) return;
    setImporting(true);
    setMessage("Importing from Xero...");
    try {
      const res = await fetch(`/api/xero/import?clientId=${clientId}`);
      const data = await res.json();
      if (data.ok) {
        setMessage(`✅ Import complete! Rolling turnover: £${Number(data.rollingTurnover).toLocaleString()}`);
        await loadData();
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch {
      setMessage("❌ Import failed. Please try again.");
    }
    setImporting(false);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f2f7f8] flex items-center justify-center" style={{ fontFamily: "'Open Sans', sans-serif" }}>
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#343b46] border-t-[#c9af69] rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-slate-400 text-sm">Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f2f7f8]" style={{ fontFamily: "'Open Sans', sans-serif" }}>

      {/* Header */}
      <div className="bg-[#343b46] px-6 py-6">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1">
              <span className="text-[#c9af69] font-bold text-xl">VAT</span>
              <span className="text-white font-bold text-xl">watchHQ</span>
            </div>
            <div className="flex gap-2">
              <a href="/" className="rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition-colors">🏠</a>
              <a href="/billing" className="rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition-colors">💳</a>
              <button onClick={onSignOut} className="rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition-colors">Sign out</button>
            </div>
          </div>
          <p className="text-slate-400 text-xs">{userEmail} · {rollingPeriod}</p>
        </div>
      </div>

      {/* Trial banner */}
      {trialDaysLeft !== null && trialDaysLeft <= 14 && (
        <div className={`px-6 py-3 text-sm flex items-center justify-between ${trialDaysLeft <= 3 ? "bg-red-50 border-b border-red-200" : "bg-yellow-50 border-b border-yellow-200"}`}>
          <p className={trialDaysLeft <= 3 ? "text-red-800 font-semibold" : "text-yellow-800"}>
            {trialDaysLeft === 0 ? "⚠️ Trial expired" : `⏰ Trial expires in ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"}`}
          </p>
          <a href="/billing" className="rounded-lg bg-[#343b46] px-3 py-1 text-xs font-semibold text-white">Upgrade →</a>
        </div>
      )}

      <div className="mx-auto max-w-2xl px-6 py-8">

        {/* Business name */}
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Business name</label>
          <input type="text" className="w-full rounded-xl border border-slate-200 p-2.5 text-sm font-semibold text-[#343b46] focus:border-[#c9af69] focus:outline-none"
            value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Your business name" />
        </div>

        {/* VAT Gauge — the hero element */}
        <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-4">VAT Threshold Monitor</p>

          {/* Big number */}
          <div className="text-center mb-6">
            <p className="text-5xl font-bold" style={{ color: risk.colour }}>
              £{rollingTurnover.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-slate-400 text-sm mt-1">Rolling 12-month taxable turnover</p>
          </div>

          {/* Progress bar */}
          <div className="mb-3">
            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
              <span>£0</span>
              <span className="font-semibold" style={{ color: risk.colour }}>{thresholdPercent.toFixed(1)}% of threshold</span>
              <span>£90,000</span>
            </div>
            <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-4 rounded-full transition-all duration-1000"
                style={{ width: `${progressWidth}%`, backgroundColor: risk.colour }} />
            </div>
          </div>

          {/* Risk badge */}
          <div className="rounded-xl p-4 text-center mt-4" style={{ backgroundColor: risk.bg, border: `1px solid ${risk.border}` }}>
            <p className="font-bold text-lg" style={{ color: risk.colour }}>{risk.status}</p>
            <p className="text-xs mt-1" style={{ color: risk.colour }}>
              {rollingTurnover >= VAT_THRESHOLD
                ? "You must register for VAT immediately"
                : `£${remaining.toLocaleString("en-GB", { minimumFractionDigits: 2 })} remaining before threshold`}
            </p>
          </div>

          {/* VAT Registration CTA */}
          {(risk.status === "Registration Required" || risk.status === "Critical" || risk.status === "High Risk") && (
            <div className="mt-4 rounded-xl bg-[#343b46] p-4">
              <p className="text-white text-sm font-semibold mb-3">
                {risk.status === "Registration Required"
                  ? "⚠️ You must register for VAT now"
                  : "⚠️ You're approaching the VAT threshold"}
              </p>
              <div className="flex gap-2 flex-wrap">
                <a href="https://www.tax.service.gov.uk/register-for-vat" target="_blank" rel="noopener noreferrer"
                  className="rounded-lg bg-[#c9af69] px-4 py-2 text-xs font-bold text-[#343b46] hover:bg-[#b89d58] transition-colors">
                  Register for VAT (HMRC) →
                </a>
                <a href="https://www.maddockandco.com/contact" target="_blank" rel="noopener noreferrer"
                  className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20 transition-colors">
                  Get help from Maddock & Co.
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Xero connection — only for paid solo */}
        {!isFree && (
          <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="font-bold text-[#343b46] mb-1">Xero Connection</h2>
            <p className="text-xs text-slate-500 mb-4">Connect Xero to import your income automatically each month.</p>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: xeroConnected ? "#16a34a" : "#6b7280" }}>
                {xeroConnected ? "✓ Connected to Xero" : "Not connected"}
              </p>
              <div className="flex gap-2">
                <button onClick={connectXero}
                  className="rounded-xl bg-[#343b46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2a303a] transition-colors">
                  {xeroConnected ? "Reconnect" : "Connect Xero"}
                </button>
                {xeroConnected && (
                  <button onClick={importFromXero} disabled={importing}
                    className="rounded-xl bg-[#c9af69] px-4 py-2 text-xs font-semibold text-[#343b46] hover:bg-[#b89d58] transition-colors disabled:opacity-50">
                    {importing ? "Importing..." : "Import from Xero"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Free plan upgrade prompt */}
        {isFree && (
          <div className="mb-6 rounded-2xl bg-[#343b46] p-5 text-white">
            <h2 className="font-bold mb-1">Connect Xero automatically</h2>
            <p className="text-slate-300 text-xs mb-3">Upgrade to Solo for £9/month to connect Xero and import your income automatically — no more manual entry.</p>
            <a href="/billing" className="inline-block rounded-xl bg-[#c9af69] px-4 py-2 text-xs font-bold text-[#343b46] hover:bg-[#b89d58] transition-colors">
              Upgrade to Solo — £9/month →
            </a>
          </div>
        )}

        {/* Monthly entry table */}
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-[#343b46]">Monthly Turnover</h2>
            {xeroConnected && !isFree && (
              <span className="text-xs text-green-600 font-semibold bg-green-50 rounded-full px-2 py-1">Auto-imported from Xero</span>
            )}
          </div>
          <p className="text-xs text-slate-400 mb-4 md:hidden">← Scroll to see all columns →</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-2 text-left">Month</th>
                  <th className="pb-2 text-center">Standard (20%)</th>
                  <th className="pb-2 text-center">Zero (0%)</th>
                  <th className="pb-2 text-center">Exempt</th>
                  <th className="pb-2 text-center font-bold text-[#343b46]">Taxable total</th>
                </tr>
              </thead>
              <tbody>
                {months.map((month, index) => (
                  <tr key={month.month} className="border-b hover:bg-[#f2f7f8]">
                    <td className="py-2 font-semibold text-[#343b46] whitespace-nowrap">{month.month}</td>
                    <td className="py-2 px-1">
                      <input type="number" className="w-24 rounded-lg border border-slate-200 p-1.5 text-xs focus:border-[#c9af69] focus:outline-none text-center"
                        value={month.standard} onChange={(e) => updateValue(index, "standard", Number(e.target.value))}
                        disabled={xeroConnected && !isFree} />
                    </td>
                    <td className="py-2 px-1">
                      <input type="number" className="w-24 rounded-lg border border-slate-200 p-1.5 text-xs focus:border-[#c9af69] focus:outline-none text-center"
                        value={month.zero} onChange={(e) => updateValue(index, "zero", Number(e.target.value))}
                        disabled={xeroConnected && !isFree} />
                    </td>
                    <td className="py-2 px-1">
                      <input type="number" className="w-24 rounded-lg border border-slate-200 p-1.5 text-xs focus:border-[#c9af69] focus:outline-none text-center"
                        value={month.exempt} onChange={(e) => updateValue(index, "exempt", Number(e.target.value))}
                        disabled={xeroConnected && !isFree} />
                    </td>
                    <td className="py-2 text-center font-bold text-[#343b46]">
                      £{(month.standard + month.zero).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-xl bg-[#f2f7f8] p-3 text-xs text-slate-500">
            <strong className="text-[#343b46]">VAT note:</strong> Standard-rated (20%) and zero-rated (0%) income count toward the threshold. Exempt income does not.
          </div>
        </div>

        {/* PDF Report */}
        {clientId && (
          <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm flex items-center justify-between">
            <div>
              <h2 className="font-bold text-[#343b46]">VAT Threshold Report</h2>
              <p className="text-xs text-slate-500 mt-1">Download a PDF report of your VAT position.</p>
            </div>
            <a href={`/api/reports/vat?clientId=${clientId}`} target="_blank" rel="noopener noreferrer"
              className="rounded-xl bg-[#343b46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2a303a] transition-colors">
              📄 Download Report
            </a>
          </div>
        )}

        {/* Message */}
        {message && (
          <div className={`mb-4 rounded-xl p-3 text-sm border-l-4 ${message.startsWith("✅") ? "bg-green-50 border-green-400 text-green-800" : message.startsWith("❌") ? "bg-red-50 border-red-400 text-red-800" : "bg-[#f2f7f8] border-[#c9af69] text-[#343b46]"}`}>
            {message}
          </div>
        )}

        {/* Save button */}
        <button onClick={saveData} disabled={saving}
          className="w-full rounded-xl bg-[#343b46] px-6 py-3 font-semibold text-white hover:bg-[#2a303a] transition-colors disabled:opacity-50 mb-8">
          {saving ? "Saving..." : "Save"}
        </button>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400">
          <a href="/terms" className="hover:text-[#343b46]">Terms</a>
          {" · "}
          <a href="/privacy" className="hover:text-[#343b46]">Privacy</a>
          {" · "}
          <span>Powered by Maddock & Co. VAT Checker</span>
        </p>

      </div>
    </main>
  );
}
