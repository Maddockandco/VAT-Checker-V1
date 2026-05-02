"use client";

import React, { useState } from "react";

export default function VatDashboard() {
  const [clientName, setClientName] = useState("");
  const [message, setMessage] = useState("");

  function saveClient() {
    if (!clientName) {
      setMessage("Please enter a client name");
      return;
    }

    setMessage("Client saved successfully (test)");
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">

        <div className="bg-blue-900 text-white p-6 rounded-2xl mb-6">
          <h1 className="text-3xl font-bold">VAT Registration Checker</h1>
          <p>Provided by Maddock & Co.</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow">
          <h2 className="text-lg font-semibold mb-4">Client Setup</h2>

          <input
            type="text"
            placeholder="Client name"
            className="w-full border p-3 rounded mb-4"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
          />

          <button
            onClick={saveClient}
            className="bg-blue-900 text-white px-4 py-2 rounded"
          >
            Save Client
          </button>

          {message && (
            <p className="mt-4 text-green-600">{message}</p>
          )}
        </div>

      </div>
    </main>
  );
}
