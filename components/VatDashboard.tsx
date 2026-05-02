"use client";

import React, { useState } from "react";
import { createClient } from "@supabase/supabase-js";

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

    if (!clientName) {
      setMessage("Enter client name.");
      return;
    }

    setSaving(true);

    const { data: firm } = await supabase
      .from("firms")
      .insert({ name: firmName })
      .select()
      .single();

    const { data: client } = await supabase
      .from("clients")
      .insert({
        firm_id: firm.id,
        name: clientName,
        sector,
      })
      .select()
      .single();

    const entries = months.map((m) => ({
      client_id: client.id,
      month_label: m.month,
      standard_rated: m.standard,
      reduced_rated: m.reduced,
      zero_rated: m.zero,
      exempt: m.exempt,
      out_of_scope: m.out,
    }));

    await supabase.from("turnover_entries").insert(entries);

    await supabase.from("vat_reviews").insert({
      client_id: client.id,
      rolling_taxable_turnover: taxableTotal,
      risk_status: risk,
    });

    setSaving(false);
    setMessage("Saved successfully.");
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl">

        <div className="mb-6 rounded-3xl bg-blue-950 p-8 text-white">
          <p>Provided by Maddock & Co.</p>
          <h1 className="text-4xl font-bold">VAT Checker</h1>
        </div>

        {/* SUMMARY */}
        <div className="grid gap-6 md:grid-cols-4 mb-6">

          <div className="bg-white p-4 rounded-xl shadow">
            <p className="text-sm text-gray-500">Taxable Turnover</p>
            <p className="text-2xl font-bold">£{taxableTotal.toLocaleString()}</p>
          </div>

          <div className="bg-white p-4 rounded-xl shadow">
            <p className="text-sm text-gray-500">Threshold</p>
            <p className="text-2xl font-bold">£90,000</p>
          </div>

          <div className="bg-white p-4 rounded-xl shadow">
            <p className="text-sm text-gray-500">Remaining</p>
            <p className="text-2xl font-bold">
              £{remaining.toLocaleString()}
            </p>
          </div>

          <div className="bg-white p-4 rounded-xl shadow">
            <p className="text-sm text-gray-500">Risk</p>
            <p className="text-2xl font-bold">{risk}</p>
          </div>

        </div>

        {/* CLIENT */}
        <div className="grid gap-6 md:grid-cols-2 mb-6">

          <div className="bg-white p-6 rounded-2xl shadow">
            <h2 className="font-bold mb-3">Firm</h2>
            <input
              className="w-full border p-2"
              value={firmName}
              onChange={(e) => setFirmName(e.target.value)}
            />
          </div>

          <div className="bg-white p-6 rounded-2xl shadow">
            <h2 className="font-bold mb-3">Client</h2>
            <input
              className="w-full border p-2 mb-3"
              placeholder="Client name"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
            <input
              className="w-full border p-2"
              placeholder="Sector"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
            />
          </div>

        </div>

        {/* TABLE */}
        <div className="bg-white p-6 rounded-2xl shadow overflow-x-auto">
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
                          className="border p-1 w-24"
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

        {/* SAVE */}
        <button
          onClick={saveAll}
          className="mt-6 bg-blue-900 text-white px-6 py-3 rounded"
        >
          {saving ? "Saving..." : "Save VAT Review"}
        </button>

        {message && <p className="mt-4">{message}</p>}

      </div>
    </main>
  );
}
