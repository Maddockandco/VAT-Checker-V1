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

type AccountingConnection = {
  id: string;
  client_id: string;
  provider: "xero" | "quickbooks" | "freeagent";
  provider_tenant_id: string | null;
  connected_at: string;
};

function formatMonth(date: Date) {
  return date.toLocaleString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

function getLastCompleted12Months(): MonthRow[] {
  const today = new Date();
  const endMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

  return Array.from({ length: 12 }, (_, index) => {
    const monthDate = new Date(
      endMonth.getFullYear(),
      endMonth.getMonth() - (11 - index),
      1
    );

    return {
      month: formatMonth(monthDate),
      standard: 0,
      reduced: 0,
      zero: 0,
      exempt: 0,
      out: 0,
    };
  });
}

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
  const [expectedNext30Days, setExpectedNext30Days] = useState(0);

  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [importingXero, setImportingXero] = useState(false);

  const [savedClients, setSavedClients] = useState<SavedClient[]>([]);
  const [savedReviews, setSavedReviews] = useState<SavedReview[]>([]);
  const [accountingConnections, setAccountingConnections] = useState<AccountingConnection[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  const [months, setMonths] = useState<MonthRow[]>(getLastCompleted12Months());

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

    const { data: connections } = await supabase
      .from("accounting_connections")
      .select("id,client_id,provider,provider_tenant_id,connected_at")
      .order("connected_at", { ascending: false });

    setSavedClients((clients || []) as SavedClient[]);
    setSavedReviews((reviews || []) as SavedReview[]);
    setAccountingConnections((connections || []) as AccountingConnection[]);
    setLoadingSaved(false);
  }

  async function openClient(client: SavedClient) {
    if (!supabase) return;

    setSelectedClientId(client.id);
    setClientName(client.name);
    setSector(client.sector || "");
    setMessage(`Editing ${client.name}`);

    const baseMonths = getLastCompleted12Months();

    const { data: entries } = await supabase
      .from("turnover_entries")
      .select("month_label,standard_rated,reduced_rated,zero_rated,exempt,out_of_scope")
      .eq("client_id", client.id);

    const loadedMonths = baseMonths.map((month) => {
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
    setExpectedNext30Days(0);
  }

  function startNewClient() {
    setSelectedClientId(null);
    setClientName("");
    setSector("");
    setExpectedNext30Days(0);
    setMonths(getLastCompleted12Months());
    setMessage("New client mode.");
  }

  function refreshRollingPeriod() {
    setMonths(getLastCompleted12Months());
    setMessage("Rolling 12-month period refreshed.");
  }

  async function connectXero() {
    if (!selectedClientId) {
      setMessage("Open or save a client before connecting Xero.");
      return;
    }

    window.location.href = `/api/xero/connect?clientId=${selectedClientId}`;
  }

  async function importFromXero() {
    if (!selectedClientId) {
      setMessage("Open a client before importing from Xero.");
      return;
    }

    setImportingXero(true);
    setMessage("Importing Xero invoices...");

    try {
      const response = await fetch(`/api/xero/import?clientId=${selectedClientId}`);
      const data = await response.json();

      if (!response.ok) {
        setMessage(`Xero import failed: ${data.error || "Unknown error"}`);
        setImportingXero(false);
        return;
      }

      setMessage(
        `Xero import complete. Rolling turnover: £${Number(
          data.rollingTurnover || 0
        ).toLocaleString()}`
      );

      await loadSavedData();

      const currentClient = savedClients.find((client) => client.id === selectedClientId);

      if (currentClient) {
        await openClient(currentClient);
      }
    } catch (error) {
      setMessage(`Xero import failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    setImportingXero(false);
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
    setAccountingConnections([]);
  }

  function updateValue(index: number, field: VatField, value: number) {
    const updated = [...months];
    updated[index] = { ...updated[index], [field]: value };
    setMonths(updated);
  }

  const rollingTaxableTurnover = months.reduce(
    (sum, month) => sum + month.standard + month.reduced + month.zero,
    0
  );

  const thresholdRemaining = VAT_THRESHOLD - rollingTaxableTurnover;
  const thresholdUsed = (rollingTaxableTurnover / VAT_THRESHOLD) * 100;
  const forwardLookTriggered = expectedNext30Days > VAT_THRESHOLD;

  const risk =
    rollingTaxableTurnover >= VAT_THRESHOLD
      ? "Registration Required"
      : forwardLookTriggered
      ? "Forward-Look Trigger"
      : rollingTaxableTurnover >= 0.9 * VAT_THRESHOLD
      ? "High Risk"
      : rollingTaxableTurnover >= 0.8 * VAT_THRESHOLD
      ? "Warning"
      : "Low Risk";

  const riskColour =
    risk === "Registration Required" || risk === "Forward-Look Trigger"
      ? "text-red-700"
      : risk === "High Risk"
      ? "text-orange-700"
      : risk === "Warning"
      ? "text-yellow-700"
      : "text-green-700";

  function latestReviewForClient(clientId: string) {
    return savedReviews.find((review) => review.client_id === clientId);
  }

  function reviewsForSelectedClient() {
    if (!selectedClientId) return [];
    return savedReviews.filter((review) => review.client_id === selectedClientId);
  }

  function connectionForClient(clientId: string, provider: "xero" | "quickbooks" | "freeagent") {
    return accountingConnections.find(
      (connection) =>
        connection.client_id === clientId && connection.provider === provider
    );
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
        .eq("client_id", clientId)
        .neq("source", "xero");

      if (deleteError) {
        setSaving(false);
        setMessage(`Could not replace manual turnover entries: ${deleteError.message}`);
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

    const entries = months.map((month) => ({
      client_id: clientId,
      month_label: month.month,
      standard_rated: month.standard,
      reduced_rated: month.reduced,
      zero_rated: month.zero,
      exempt: month.exempt,
      out_of_scope: month.out,
      source: "manual",
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
      rolling_taxable_turnover: rollingTaxableTurnover,
      expected_next_30_days: expectedNext30Days,
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

  const selectedClientReviews = reviewsForSelectedClient();
  const rollingPeriod =
    months.length > 0 ? `${months[0].month} to ${months[months.length - 1].month}` : "";

  const selectedXeroConnection = selectedClientId
    ? connectionForClient(selectedClientId, "xero")
    : undefined;

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 rounded-3xl bg-blue-950 p-8 text-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p>Provided by Maddock & Co.</p>
              <h1 className="mt-2 text-4xl font-bold">VAT Checker</h1>
              <p className="mt-2 text-blue-100">Signed in as {user.email}</p>
              <p className="mt-1 text-sm text-blue-100">
                Rolling period: {rollingPeriod}
              </p>
            </div>

            <button
              onClick={signOut}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20"
            >
              Sign out
            </button>
          </div>
        </div>

        <div className="mb-6 grid gap-6 md:grid-cols-5">
          <div className="rounded-xl bg-white p-4 shadow">
            <p className="text-sm text-gray-500">Rolling taxable turnover</p>
            <p className="text-2xl font-bold">£{rollingTaxableTurnover.toLocaleString()}</p>
          </div>

          <div className="rounded-xl bg-white p-4 shadow">
            <p className="text-sm text-gray-500">Threshold used</p>
            <p className="text-2xl font-bold">{thresholdUsed.toFixed(1)}%</p>
          </div>

          <div className="rounded-xl bg-white p-4 shadow">
            <p className="text-sm text-gray-500">Remaining</p>
            <p className="text-2xl font-bold">£{thresholdRemaining.toLocaleString()}</p>
          </div>

          <div className="rounded-xl bg-white p-4 shadow">
            <p className="text-sm text-gray-500">30-day forecast</p>
            <p className="text-2xl font-bold">£{expectedNext30Days.toLocaleString()}</p>
          </div>

          <div className="rounded-xl bg-white p-4 shadow">
            <p className="text-sm text-gray-500">Risk</p>
            <p className={`text-2xl font-bold ${riskColour}`}>{risk}</p>
          </div>
        </div>

        <div className="mb-6 rounded-2xl bg-white p-6 shadow">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold">Saved clients</h2>
              <p className="text-sm text-slate-500">
                Open a client to view, edit or import from Xero.
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
                    <th className="p-2">Xero</th>
                    <th className="p-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {savedClients.map((client) => {
                    const review = latestReviewForClient(client.id);
                    const xeroConnection = connectionForClient(client.id, "xero");

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
                          {xeroConnection ? (
                            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                              Connected
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                              Not connected
                            </span>
                          )}
                        </td>
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

        {selectedClientId && (
          <div className="mb-6 rounded-2xl bg-white p-6 shadow">
            <h2 className="text-xl font-bold">Accounting software connection</h2>
            <p className="mt-1 text-sm text-slate-500">
              Connect Xero and import invoice income automatically.
            </p>

            <div className="mt-4 rounded-2xl border bg-slate-50 p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="font-semibold">Xero</h3>
                  <p className="text-sm text-slate-600">
                    {selectedXeroConnection
                      ? `Connected on ${new Date(
                          selectedXeroConnection.connected_at
                        ).toLocaleDateString("en-GB")}`
                      : "Not connected yet."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={connectXero}
                    className="rounded-xl bg-blue-950 px-4 py-2 text-sm font-semibold text-white"
                  >
                    {selectedXeroConnection ? "Reconnect Xero" : "Connect Xero"}
                  </button>

                  <button
                    onClick={importFromXero}
                    disabled={!selectedXeroConnection || importingXero}
                    className="rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {importingXero ? "Importing..." : "Import from Xero"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedClientId && (
          <div className="mb-6 rounded-2xl bg-white p-6 shadow">
            <h2 className="text-xl font-bold">Client VAT history</h2>
            <p className="mt-1 text-sm text-slate-500">
              Audit trail of previous VAT reviews for {clientName}.
            </p>

            {selectedClientReviews.length === 0 ? (
              <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                No VAT review history found for this client.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2">Review date</th>
                      <th className="p-2">Taxable turnover</th>
                      <th className="p-2">Risk status</th>
                      <th className="p-2">Version</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedClientReviews.map((review, index) => (
                      <tr key={review.id} className={index === 0 ? "border-b bg-blue-50" : "border-b"}>
                        <td className="p-2">
                          {new Date(review.created_at).toLocaleString("en-GB")}
                        </td>
                        <td className="p-2 font-semibold">
                          £{Number(review.rolling_taxable_turnover).toLocaleString()}
                        </td>
                        <td className="p-2">{review.risk_status}</td>
                        <td className="p-2">
                          {index === 0 ? "Latest review" : `Previous review ${index}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

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
              className="mb-3 w-full rounded border p-2"
              placeholder="Sector"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
            />

            <label className="block text-sm font-medium">
              Expected taxable turnover in next 30 days
            </label>
            <input
              type="number"
              className="mt-1 w-full rounded border p-2"
              value={expectedNext30Days}
              onChange={(e) => setExpectedNext30Days(Number(e.target.value || 0))}
            />
          </div>
        </div>

        <div className="mb-3 flex justify-end">
          <button
            onClick={refreshRollingPeriod}
            className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Refresh latest 12-month period
          </button>
        </div>

        <div className="overflow-x-auto rounded-2xl bg-white p-6 shadow">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>Month</th>
                <th>Standard-rated</th>
                <th>Reduced-rated</th>
                <th>Zero-rated</th>
                <th>Exempt</th>
                <th>Out of scope</th>
                <th>Taxable total</th>
              </tr>
            </thead>
            <tbody>
              {months.map((month, index) => (
                <tr key={month.month}>
                  <td className="p-2 font-medium">{month.month}</td>
                  {(["standard", "reduced", "zero", "exempt", "out"] as VatField[]).map(
                    (field) => (
                      <td key={field} className="p-2">
                        <input
                          type="number"
                          className="w-28 rounded border p-2"
                          value={month[field]}
                          onChange={(e) =>
                            updateValue(index, field, Number(e.target.value))
                          }
                        />
                      </td>
                    )
                  )}
                  <td className="p-2 font-semibold">
                    £{(month.standard + month.reduced + month.zero).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 rounded-2xl bg-white p-5 text-sm text-slate-700 shadow">
          <strong>VAT logic:</strong> Standard-rated, reduced-rated and zero-rated income are included in taxable turnover. Exempt and out-of-scope income are excluded from the VAT registration threshold calculation.
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
