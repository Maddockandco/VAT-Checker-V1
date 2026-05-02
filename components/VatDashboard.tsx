"use client";

import React, { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export default function VatDashboard() {
  const [firmName, setFirmName] = useState("Maddock & Co.");
  const [clientName, setClientName] = useState("");
  const [sector, setSector] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveFirmAndClient() {
    setMessage("");

    if (!firmName.trim()) {
      setMessage("Please enter the accounting firm name.");
      return;
    }

    if (!clientName.trim()) {
      setMessage("Please enter the client name.");
      return;
    }

    if (!supabase) {
      setMessage("Supabase is not connected. Check Vercel environment variables.");
      return;
    }

    setSaving(true);

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

    const { error: clientError } = await supabase.from("clients").insert({
      firm_id: firm.id,
      name: clientName,
      sector: sector || null,
      accounting_connection_status: "not_connected",
    });

    setSaving(false);

    if (clientError) {
      setMessage(`Client save failed: ${clientError.message}`);
      return;
    }

    setMessage("Accounting firm and client saved successfully.");
    setClientName("");
    setSector("");
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 rounded-3xl bg-blue-950 p-8 text-white shadow-xl">
          <p className="text-sm">Provided by Maddock & Co.</p>
          <h1 className="mt-2 text-4xl font-bold">VAT Registration Checker</h1>
          <p className="mt-3 text-blue-100">
            Multi-firm VAT tracking foundation for accountants and their clients.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold">Accounting Firm</h2>

            <label className="block text-sm font-medium">Firm name</label>
            <input
              type="text"
              className="mb-4 mt-1 w-full rounded-xl border p-3"
              value={firmName}
              onChange={(e) => setFirmName(e.target.value)}
            />
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold">Client Setup</h2>

            <label className="block text-sm font-medium">Client name</label>
            <input
              type="text"
              className="mb-4 mt-1 w-full rounded-xl border p-3"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />

            <label className="block text-sm font-medium">Business sector</label>
            <input
              type="text"
              className="mb-4 mt-1 w-full rounded-xl border p-3"
              placeholder="Example: consultancy, retail, construction"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
            />

            <button
              onClick={saveFirmAndClient}
              disabled={saving}
              className="w-full rounded-xl bg-blue-950 px-4 py-3 font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Firm and Client"}
            </button>

            {message && (
              <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                {message}
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
