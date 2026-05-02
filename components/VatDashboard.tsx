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

  const [months, setMonths] = useState<MonthRow[]>(
    Array.from({ length: 12 }, (_, i) => ({
      month: `Month ${i + 1}`,
      standard: 0,
      reduced: 0,
      zero: 0,
      exempt: 0,
      out: 0,
    }))
  );

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

    const { data: firm, error: firmError } = await supabase
      .from("firms")
      .insert({ name: firmName })
      .select()
      .single();

    if (firmError || !firm) {
      setSaving(false);
      setMessage(`Firm save failed: ${firmError?.message || "Unknown error"}`);
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

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 rounded-3xl bg-blue-950 p-8 text-white">
          <p>Provided by Maddock & Co.</p>
          <h1 className="text-4xl font-bold">VAT Checker</h1>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-6 shadow">
            <h2 className="mb-3 font-bold">Firm</h2>
            <input
              className="mb-3 w-full border p-2"
              value={firmName}
              onChange={(e) => setFirmName(e.target.value)}
            />
          </div>

          <div className="rounded-2xl bg-white p-6 shadow">
            <h2 className="mb-3 font-bold">Client</h2>
            <input
              className="mb-3 w-full border p-2"
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

          <div className="rounded-2xl bg-white p-6 shadow">
            <h2 className="mb-3 font-bold">VAT Status</h2>
            <p>Total: £{taxableTotal.toLocaleString()}</p>
            <p>Status: {risk}</p>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto rounded-2xl bg-white p-6 shadow">
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
          {saving ? "Saving..." : "Save Full VAT Review"}
        </button>

        {message && <p className="mt-4">{message}</p>}
      </div>
    </main>
  );
}
