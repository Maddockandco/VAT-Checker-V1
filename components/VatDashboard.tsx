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
  const [clientName, setClientName] = useState("");
  const [sector, setSector] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveClient() {
    setMessage("");

    if (!clientName.trim()) {
      setMessage("Please enter a client name.");
      return;
    }

    if (!supabase) {
      setMessage("Supabase is not connected. Check Vercel environment variables.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("clients").insert({
      name: clientName,
      sector: sector || null,
    });

    setSaving(false);

    if (error) {
      setMessage(`Save failed: ${error.message}`);
      return;
    }

    setMessage("Client saved successfully to Supabase.");
    setClientName("");
    setSector("");
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 rounded-2xl bg-blue-900 p-6 text-white">
          <p className="text-sm">Provided by Maddock & Co.</p>
          <h1 className="mt-2 text-3xl font-bold">VAT Registration Checker</h1>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold">Client Setup</h2>

          <label className="block text-sm font-medium">Client name</label>
          <input
            type="text"
            placeholder="Client name"
            className="mb-4 mt-1 w-full rounded border p-3"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
          />

          <label className="block text-sm font-medium">Business sector</label>
          <input
            type="text"
            placeholder="Example: consultancy, retail, construction"
            className="mb-4 mt-1 w-full rounded border p-3"
            value={sector}
            onChange={(e) => setSector(e.target.value)}
          />

          <button
            onClick={saveClient}
            disabled={saving}
            className="rounded bg-blue-900 px-4 py-2 text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Client"}
          </button>

          {message && <p className="mt-4 text-sm">{message}</p>}
        </div>
      </div>
    </main>
  );
}
