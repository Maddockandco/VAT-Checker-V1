"use client";

import React, { useEffect, useState } from "react";
import { createClient, type User } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

const VAT_THRESHOLD = 90000;

type VatField = "standard" | "reduced" | "zero" | "exempt" | "out";

type MonthRow = {
  month: string;
  standard: number;
  reduced: number;
  zero: number;
  exempt: number;
  out: number;
};

export default function VatDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [loginMessage, setLoginMessage] = useState("");

  const [firmName, setFirmName] = useState("Maddock & Co.");
  const [clientName, setClientName] = useState("");
  const [sector, setSector] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [months, setMonths] = useState<MonthRow[]>([
    { month: "May 2025", standard: 0, reduced: 0, zero: 0, exempt: 0, out: 0 },
    { month: "Jun 2025", standard: 0, reduced: 0, zero: 0, exempt: 0, out: 0 },
    { month: "Jul 2025", standard: 0, reduced: 0, zero: 0, exempt: 0, out: 0 },
    { month: "Aug 2025", standard: 0, reduced: 0, zero: 0, exempt: 0, out: 0 },
    { month: "Sep 2025", standard: 0, reduced: 0, zero: 0, exempt: 0, out: 0 },
    { month: "Oct 2025", standard: 0, reduced: 0, zero: 0, exempt: 0, out: 0 },
    { month: "Nov 2025", standard: 0, reduced: 0, zero: 0, exempt: 0, out: 0 },
    { month: "Dec 2025", standard: 0, reduced: 0, zero: 0, exempt: 0, out: 0 },
    { month: "Jan 2026", standard: 0, reduced: 0, zero: 0, exempt: 0, out: 0 },
    { month: "Feb 2026", standard: 0, reduced: 0, zero: 0, exempt: 0, out: 0 },
    { month: "Mar 2026", standard: 0, reduced: 0, zero: 0, exempt: 0, out: 0 },
    { month: "Apr 2026", standard: 0, reduced: 0, zero: 0, exempt: 0, out: 0 },
  ]);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser(data.user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function sendLoginLink() {
    setLoginMessage("");

    if (!supabase) {
      setLoginMessage("Supabase is not connected.");
      return;
    }

    if (!email.trim()) {
      setLoginMessage("Please enter your email address.");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });

    if (error) {
      setLoginMessage(error.message);
      return;
    }

    setLoginMessage("Check your email for the secure login link.");
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
  }

  function updateValue(index: number, field: VatField, value: number) {
    const updated = [...months];
    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    setMonths(updated);
  }

  const taxableTotal = months.reduce(
    (sum, m) => sum + m.standard + m.reduced + m.zero,
    0
  );

  const percentageUsed = (taxableTotal / VAT_THRESHOLD) * 100;
  const remaining = VAT_THRESHOLD - taxableTotal;

  const risk =
    taxableTotal >= VAT_THRESHOLD
      ? "Registration Required"
      : taxableTotal >= 0.9 * VAT_THRESHOLD
      ? "High Risk"
      : taxableTotal >= 0.8 * VAT_THRESHOLD
      ? "Warning"
      : "Low Risk";

  async function saveAll() {
    setMessage("");

    if (!supabase) {
      setMessage("Supabase not connected.");
      return;
    }

    if (!user) {
      setMessage("Please sign in before saving.");
      return;
    }

    if (!clientName.trim()) {
      setMessage("Enter client name.");
      return;
    }

    setSaving(true);

    const { data: profile } = await supabase
      .from("user_profiles")
      .upsert({
        id: user.id,
        email: user.email,
        role: "firm_admin",
      })
      .select()
      .single();

    if (!profile) {
      setSaving(false);
      setMessage("Could not create user profile.");
      return;
    }

    const { data: firm, error: firmError } = await supabase
      .from("firms")
      .insert({
        name: firmName,
        subscription_status: "trial",
      })
      .select()
      .single();

    if (firmError || !firm) {
      setSaving(false);
      setMessage(`Firm save failed: ${firmError?.message || "Unknown error"}`);
      return;
    }

    const { error: firmAccessError } = await supabase
      .from("firm_user_access")
      .insert({
        firm_id: firm.id,
        user_id: user.id,
        role: "firm_admin",
      });

    if (firmAccessError) {
      setSaving(false);
      setMessage(`Firm access save failed: ${firmAccessError.message}`);
      return;
    }

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .insert({
        firm_id: firm.id,
        name: clientName,
        sector,
      })
      .select()
      .single();

    if (clientError || !client) {
      setSaving(false);
      setMessage(`Client save failed: ${clientError?.message || "Unknown error"}`);
      return;
    }

    const entries = months.map((m) => ({
      client_id: client.id,
      month_label: m.month,
      standard_rated: m.standard,
      reduced_rated: m.reduced,
      zero_rated: m.zero,
      exempt: m.exempt,
      out_of_scope: m.out,
    }));

    const { error: turnoverError } = await supabase
      .from("turnover_entries")
      .insert(entries);

    if (turnoverError) {
      setSaving(false);
      setMessage(`Turnover save failed: ${turnoverError.message}`);
      return;
    }

    const { error: reviewError } = await supabase.from("vat_reviews").insert({
      client_id: client.id,
      rolling_taxable_turnover: taxableTotal,
      risk_status: risk,
    });

    setSaving(false);

    if (reviewError) {
      setMessage(`Review save failed: ${reviewError.message}`);
      return;
    }

    setMessage("Saved successfully.");
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-xl">
          <div className="mb-6 rounded-3xl bg-blue-950 p-8 text-white">
            <p>Provided by Maddock & Co.</p>
            <h1 className="mt-2 text-4xl font-bold">VAT Checker Login</h1>
            <p className="mt-3 text-blue-100">
              Secure access for accounting firms and client users.
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold">Sign in</h2>

            <label className="block text-sm font-medium">Email address</label>
            <input
              type="email"
              className="mb-4 mt-1 w-full rounded-xl border p-3"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <button
              onClick={sendLoginLink}
              className="w-full rounded-xl bg-blue-950 px-4 py-3 font-semibold text-white"
            >
              Send secure login link
            </button>

            {loginMessage && (
              <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                {loginMessage}
              </p>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 rounded-3xl bg-blue-950 p-8 text-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p>Provided by Maddock & Co.</p>
              <h1 className="mt-2 text-4xl font-bold">VAT Checker</h1>
              <p className="mt-2 text-blue-100">Signed in as {user.email}</p>
            </div>

            <button
              onClick={signOut}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20"
            >
              Sign out
            </button>
          </div>
        </div>

        <div className="mb-6 grid gap-6 md:grid-cols-4">
          <div className="rounded-xl bg-white p-4 shadow">
            <p className="text-sm text-gray-500">Taxable Turnover</p>
            <p className="text-2xl font-bold">£{taxableTotal.toLocaleString()}</p>
          </div>

          <div className="rounded-xl bg-white p-4 shadow">
            <p className="text-sm text-gray-500">Threshold</p>
            <p className="text-2xl font-bold">£90,000</p>
          </div>

          <div className="rounded-xl bg-white p-4 shadow">
            <p className="text-sm text-gray-500">Remaining</p>
            <p className="text-2xl font-bold">£{remaining.toLocaleString()}</p>
          </div>

          <div className="rounded-xl bg-white p-4 shadow">
            <p className="text-sm text-gray-500">Risk</p>
            <p className="text-2xl font-bold">{risk}</p>
          </div>
        </div>

        <div className="mb-6 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-6 shadow">
            <h2 className="mb-3 font-bold">Firm</h2>
            <input
              className="w-full rounded border p-2"
              value={firmName}
              onChange={(e) => setFirmName(e.target.value)}
            />
          </div>

          <div className="rounded-2xl bg-white p-6 shadow">
            <h2 className="mb-3 font-bold">Client</h2>
            <input
              className="mb-3 w-full rounded border p-2"
              placeholder="Client name"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
            <input
              className="w-full rounded border p-2"
              placeholder="Sector"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl bg-white p-6 shadow">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>Month</th>
                <th>Standard</th>
                <th>Reduced</th>
                <th>Zero</th>
                <th>Exempt</th>
                <th>Out</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m, i) => (
                <tr key={i}>
                  <td>{m.month}</td>
                  {(["standard", "reduced", "zero", "exempt", "out"] as VatField[]).map(
                    (field) => (
                      <td key={field}>
                        <input
                          type="number"
                          className="w-24 border p-1"
                          value={m[field]}
                          onChange={(e) =>
                            updateValue(i, field, Number(e.target.value))
                          }
                        />
                      </td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={saveAll}
          className="mt-6 rounded bg-blue-900 px-6 py-3 text-white"
          disabled={saving}
        >
          {saving ? "Saving..." : "Save VAT Review"}
        </button>

        {message && <p className="mt-4">{message}</p>}
      </div>
    </main>
  );
}
