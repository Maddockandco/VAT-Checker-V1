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

type SavedClient = {
  id: string;
  name: string;
  sector: string | null;
  firm_id: string | null;
  created_at: string;
};

type SavedReview = {
  id: string;
  client_id: string;
  rolling_taxable_turnover: number;
  risk_status: string;
  created_at: string;
};

const defaultMonths: MonthRow[] = [
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
];

export default function VatDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");

  const [firmName, setFirmName] = useState("Maddock & Co.");
  const [clientName, setClientName] = useState("");
  const [sector, setSector] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedClients, setSavedClients] = useState<SavedClient[]>([]);
  const [savedReviews, setSavedReviews] = useState<SavedReview[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [months, setMonths] = useState<MonthRow[]>(defaultMonths);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser(data.user);
        loadSavedData();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user) loadSavedData();
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadSavedData() {
    if (!supabase) return;
    setLoadingSaved(true);

    const { data: clients } = await supabase
      .from("clients")
      .select("id,name,sector,firm_id,created_at")
      .order("created_at", { ascending: false });

    const { data: reviews } = await supabase
      .from("vat_reviews")
      .select("id,client_id,rolling_taxable_turnover,risk_status,created_at")
      .order("created_at", { ascending: false });

    setSavedClients((clients || []) as SavedClient[]);
    setSavedReviews((reviews || []) as SavedReview[]);
    setLoadingSaved(false);
  }

  async function openClient(client: SavedClient) {
    if (!supabase) return;

    setSelectedClientId(client.id);
    setClientName(client.name);
    setSector(client.sector || "");
    setMessage(`Editing ${client.name}`);

    const { data: entries } = await supabase
      .from("turnover_entries")
      .select("month_label,standard_rated,reduced_rated,zero_rated,exempt,out_of_scope")
      .eq("client_id", client.id);

    const loadedMonths = defaultMonths.map((month) => {
      const match = entries?.find((entry) => entry.month_label === month.month);

      return {
        month: month.month,
        standard: Number(match?.standard_rated || 0),
        reduced: Number(match?.reduced_rated || 0),
        zero: Number(match?.zero_rated || 0),
        exempt: Number(match?.exempt || 0),
        out: Number(match?.out_of_scope || 0),
      };
    });

    setMonths(loadedMonths);
  }

  function startNewClient() {
    setSelectedClientId(null);
    setClientName("");
    setSector("");
    setMonths(defaultMonths);
    setMessage("New client mode.");
  }

  async function signUp() {
    setLoginMessage("");

    if (!supabase) {
      setLoginMessage("Supabase is not connected.");
      return;
    }

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setLoginMessage(error.message);
      return;
    }

    if (data.user) setUser(data.user);
  }

  async function signIn() {
    setLoginMessage("");

    if (!supabase) {
      setLoginMessage("Supabase is not connected.");
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoginMessage(error.message);
      return;
    }

    if (data.user) {
      setUser(data.user);
      await loadSavedData();
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setSavedClients([]);
    setSavedReviews([]);
  }

  function updateValue(index: number, field: VatField, value: number) {
    const updated = [...months];
    updated[index] = { ...updated[index], [field]: value };
    setMonths(updated);
  }

  const taxableTotal = months.reduce(
    (sum, m) => sum + m.standard + m.reduced + m.zero,
    0
  );

  const remaining = VAT_THRESHOLD - taxableTotal;

  const risk =
    taxableTotal >= VAT_THRESHOLD
      ? "Registration Required"
      : taxableTotal >= 0.9 * VAT_THRESHOLD
      ? "High Risk"
      : taxableTotal >= 0.8 * VAT_THRESHOLD
      ? "Warning"
      : "Low Risk";

  function latestReviewForClient(clientId: string) {
    return savedReviews.find((review) => review.client_id === clientId);
  }

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

    let clientId = selectedClientId;

    if (clientId) {
      const { error: clientUpdateError } = await supabase
        .from("clients")
        .update({
          name: clientName,
          sector,
        })
        .eq("id", clientId);

      if (clientUpdateError) {
        setSaving(false);
        setMessage(`Client update failed: ${clientUpdateError.message}`);
        return;
      }

      const { error: deleteError } = await supabase
        .from("turnover_entries")
        .delete()
        .eq("client_id", clientId);

      if (deleteError) {
        setSaving(false);
        setMessage(`Could not replace turnover entries: ${deleteError.message}`);
        return;
      }
    } else {
      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .upsert({
          id: user.id,
          email: user.email,
          role: "firm_admin",
        })
        .select()
        .single();

      if (profileError || !profile) {
        setSaving(false);
        setMessage(`Profile save failed: ${profileError?.message || "Unknown error"}`);
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

      clientId = client.id;
      setSelectedClientId(client.id);
    }

    const entries = months.map((m) => ({
      client_id: clientId,
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
      client_id: clientId,
      rolling_taxable_turnover: taxableTotal,
      risk_status: risk,
    });

    setSaving(false);

    if (reviewError) {
      setMessage(`Review save failed: ${reviewError.message}`);
      return;
    }

    setMessage(selectedClientId ? "Client updated successfully." : "New client saved successfully.");
    await loadSavedData();
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
            <div className="mb-4 flex gap-2 rounded-xl bg-slate-100 p-1">
              <button
                onClick={() => setAuthMode("signin")}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold ${
                  authMode === "signin" ? "bg-white shadow" : "text-slate-600"
                }`}
              >
                Sign in
              </button>
              <button
                onClick={() => setAuthMode("signup")}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold ${
                  authMode === "signup" ? "bg-white shadow" : "text-slate-600"
                }`}
              >
                Create account
              </button>
            </div>

            <label className="block text-sm font-medium">Email address</label>
            <input
              type="email"
              className="mb-4 mt-1 w-full rounded-xl border p-3"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <label className="block text-sm font-medium">Password</label>
            <input
              type="password"
              className="mb-4 mt-1 w-full rounded-xl border p-3"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button
              onClick={authMode === "signin" ? signIn : signUp}
              className="w-full rounded-xl bg-blue-950 px-4 py-3 font-semibold text-white"
            >
              {authMode === "signin" ? "Sign in" : "Create account"}
            </button>

            {loginMessage && (
              <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm">
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
            <p className="text-sm text-gray-500">Current taxable turnover</p>
            <p className="text-2xl font-bold">£{taxableTotal.toLocaleString()}</p>
          </div>

          <div className="rounded-xl bg-white p-4 shadow">
            <p className="text-sm text-gray-500">VAT threshold</p>
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

        <div className="mb-6 rounded-2xl bg-white p-6 shadow">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold">Saved clients</h2>
              <p className="text-sm text-slate-500">
                Open a client to view or update their VAT review.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={startNewClient}
                className="rounded-xl bg-blue-950 px-4 py-2 text-sm font-semibold text-white"
              >
                New client
              </button>
              <button
                onClick={loadSavedData}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                {loadingSaved ? "Loading..." : "Refresh"}
              </button>
            </div>
          </div>

          {savedClients.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              No saved clients yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2">Client</th>
                    <th className="p-2">Sector</th>
                    <th className="p-2">Latest turnover</th>
                    <th className="p-2">Latest risk</th>
                    <th className="p-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {savedClients.map((client) => {
                    const review = latestReviewForClient(client.id);
                    return (
                      <tr key={client.id} className="border-b">
                        <td className="p-2 font-medium">{client.name}</td>
                        <td className="p-2">{client.sector || "-"}</td>
                        <td className="p-2">
                          {review
                            ? `£${Number(review.rolling_taxable_turnover).toLocaleString()}`
                            : "-"}
                        </td>
                        <td className="p-2">{review?.risk_status || "-"}</td>
                        <td className="p-2">
                          <button
                            onClick={() => openClient(client)}
                            className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-semibold"
                          >
                            Open / edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
            <h2 className="mb-3 font-bold">
              {selectedClientId ? "Editing client" : "New client review"}
            </h2>
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
          {saving
            ? "Saving..."
            : selectedClientId
            ? "Update VAT Review"
            : "Save New VAT Review"}
        </button>

        {message && <p className="mt-4">{message}</p>}
      </div>
    </main>
  );
}
