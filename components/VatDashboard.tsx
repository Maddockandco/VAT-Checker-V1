"use client";

import React, { useEffect, useState } from "react";
import { createClient, type User } from "@supabase/supabase-js";
import AccountMappings from "@/components/AccountMappings";

// Maddock & Co brand colours:
// Primary dark:  #343b46
// Gold accent:   #c9af69
// Light bg:      #f2f7f8
// Near black:    #060606
// Font: Open Sans

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

type VatAlert = {
  id: string;
  client_id: string;
  threshold_percentage: number;
  alert_type: string;
  message: string;
  created_at: string;
};

function formatMonth(date: Date) {
  return date.toLocaleString("en-GB", { month: "short", year: "numeric" });
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
    return { month: formatMonth(monthDate), standard: 0, reduced: 0, zero: 0, exempt: 0, out: 0 };
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
  const [vatAlerts, setVatAlerts] = useState<VatAlert[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  const [months, setMonths] = useState<MonthRow[]>(getLastCompleted12Months());

  // New client modal state
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientSector, setNewClientSector] = useState("");
  const [newClientSaving, setNewClientSaving] = useState(false);
  const [newClientError, setNewClientError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) { setUser(data.user); loadSavedData(); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user) loadSavedData();
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadSavedData() {
    if (!supabase) return;
    setLoadingSaved(true);
    const { data: clients } = await supabase.from("clients").select("id,name,sector,firm_id,created_at").order("created_at", { ascending: false });
    const { data: reviews } = await supabase.from("vat_reviews").select("id,client_id,rolling_taxable_turnover,risk_status,created_at").order("created_at", { ascending: false });
    const { data: connections } = await supabase.from("accounting_connections").select("id,client_id,provider,provider_tenant_id,connected_at").order("connected_at", { ascending: false });
    const { data: alerts } = await supabase.from("vat_alerts").select("id,client_id,threshold_percentage,alert_type,message,created_at").order("created_at", { ascending: false });
    setSavedClients((clients || []) as SavedClient[]);
    setSavedReviews((reviews || []) as SavedReview[]);
    setAccountingConnections((connections || []) as AccountingConnection[]);
    setVatAlerts((alerts || []) as VatAlert[]);
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
      .select("month_label,standard_rated,reduced_rated,zero_rated,exempt,out_of_scope,source")
      .eq("client_id", client.id);

    const loadedMonths = baseMonths.map((month) => {
      // Prefer xero source over manual — if xero data exists use it,
      // otherwise fall back to manual entry
      const xeroEntry = entries?.find(
        (e) => e.month_label === month.month && e.source === "xero"
      );
      const manualEntry = entries?.find(
        (e) => e.month_label === month.month && e.source === "manual"
      );
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

    setMonths(loadedMonths);
    setExpectedNext30Days(0);
  }

  function refreshRollingPeriod() {
    setMonths(getLastCompleted12Months());
    setMessage("Rolling 12-month period refreshed.");
  }

  async function connectXero() {
    if (!selectedClientId) { setMessage("Open a client before connecting Xero."); return; }
    window.location.href = `/api/xero/connect?clientId=${selectedClientId}`;
  }

  async function importFromXero() {
    if (!selectedClientId) { setMessage("Open a client before importing from Xero."); return; }
    setImportingXero(true);
    setMessage("Importing from Xero...");
    try {
      const response = await fetch(`/api/xero/import?clientId=${selectedClientId}`);
      const data = await response.json();
      if (!response.ok) { setMessage(`Xero import failed: ${data.error || "Unknown error"}`); setImportingXero(false); return; }
      setMessage(`Xero import complete. Rolling turnover: £${Number(data.rollingTurnover || 0).toLocaleString()}`);
      await loadSavedData();
      const currentClient = savedClients.find((c) => c.id === selectedClientId);
      if (currentClient) await openClient(currentClient);
    } catch (error) {
      setMessage(`Xero import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    setImportingXero(false);
  }

  async function signUp() {
    setLoginMessage("");
    if (!supabase) { setLoginMessage("Supabase is not connected."); return; }
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { setLoginMessage(error.message); return; }
    if (data.user) setUser(data.user);
  }

  async function signIn() {
    setLoginMessage("");
    if (!supabase) { setLoginMessage("Supabase is not connected."); return; }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setLoginMessage(error.message); return; }
    if (data.user) { setUser(data.user); await loadSavedData(); }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setSavedClients([]); setSavedReviews([]); setAccountingConnections([]); setVatAlerts([]);
  }

  function updateValue(index: number, field: VatField, value: number) {
    const updated = [...months];
    updated[index] = { ...updated[index], [field]: value };
    setMonths(updated);
  }

  // New client modal submit
  async function createNewClient() {
    setNewClientError("");
    if (!supabase) { setNewClientError("Supabase not connected."); return; }
    if (!user) { setNewClientError("Please sign in first."); return; }
    if (!newClientName.trim()) { setNewClientError("Please enter a client name."); return; }

    setNewClientSaving(true);

    try {
      // Upsert user profile
      const { error: profileError } = await supabase
        .from("user_profiles")
        .upsert({ id: user.id, email: user.email, role: "firm_admin" });
      if (profileError) throw new Error(`Profile error: ${profileError.message}`);

      // Create firm
      const { data: firm, error: firmError } = await supabase
        .from("firms")
        .insert({ name: firmName, subscription_status: "trial" })
        .select()
        .single();
      if (firmError || !firm) throw new Error(`Firm error: ${firmError?.message}`);

      // Firm access
      await supabase.from("firm_user_access").insert({ firm_id: firm.id, user_id: user.id, role: "firm_admin" });

      // Create client
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .insert({ firm_id: firm.id, name: newClientName.trim(), sector: newClientSector.trim() || null })
        .select()
        .single();
      if (clientError || !client) throw new Error(`Client error: ${clientError?.message}`);

      // Close modal and open the new client
      setShowNewClientModal(false);
      setNewClientName("");
      setNewClientSector("");
      await loadSavedData();
      await openClient(client as SavedClient);
      setMessage(`Client "${client.name}" created successfully. You can now connect Xero below.`);

    } catch (err) {
      setNewClientError(err instanceof Error ? err.message : "Something went wrong.");
    }

    setNewClientSaving(false);
  }

  async function saveAll() {
    setMessage("");
    if (!supabase) { setMessage("Supabase not connected."); return; }
    if (!user) { setMessage("Please sign in before saving."); return; }
    if (!clientName.trim()) { setMessage("Enter client name."); return; }
    if (!selectedClientId) { setMessage("Please create a client first using the New Client button."); return; }

    setSaving(true);

    const { error: clientUpdateError } = await supabase
      .from("clients")
      .update({ name: clientName, sector })
      .eq("id", selectedClientId);
    if (clientUpdateError) { setSaving(false); setMessage(`Client update failed: ${clientUpdateError.message}`); return; }

    await supabase.from("turnover_entries").delete().eq("client_id", selectedClientId).neq("source", "xero");

    const entries = months.map((month) => ({
      client_id: selectedClientId,
      month_label: month.month,
      standard_rated: month.standard,
      reduced_rated: month.reduced,
      zero_rated: month.zero,
      exempt: month.exempt,
      out_of_scope: month.out,
      source: "manual",
    }));

    const { error: turnoverError } = await supabase.from("turnover_entries").insert(entries);
    if (turnoverError) { setSaving(false); setMessage(`Turnover save failed: ${turnoverError.message}`); return; }

    const rollingTaxableTurnover = months.reduce((sum, m) => sum + m.standard + m.reduced + m.zero, 0);
    const forwardLookTriggered = expectedNext30Days > VAT_THRESHOLD;
    const risk =
      rollingTaxableTurnover >= VAT_THRESHOLD ? "Registration Required"
      : forwardLookTriggered ? "Forward-Look Trigger"
      : rollingTaxableTurnover >= 0.9 * VAT_THRESHOLD ? "High Risk"
      : rollingTaxableTurnover >= 0.8 * VAT_THRESHOLD ? "Warning"
      : "Low Risk";

    const { error: reviewError } = await supabase.from("vat_reviews").insert({
      client_id: selectedClientId,
      rolling_taxable_turnover: rollingTaxableTurnover,
      expected_next_30_days: expectedNext30Days,
      risk_status: risk,
    });

    setSaving(false);
    if (reviewError) { setMessage(`Review save failed: ${reviewError.message}`); return; }
    setMessage("Client updated successfully.");
    await loadSavedData();
  }

  const rollingTaxableTurnover = months.reduce((sum, m) => sum + m.standard + m.reduced + m.zero, 0);
  const thresholdRemaining = VAT_THRESHOLD - rollingTaxableTurnover;
  const thresholdUsed = (rollingTaxableTurnover / VAT_THRESHOLD) * 100;
  const forwardLookTriggered = expectedNext30Days > VAT_THRESHOLD;
  const risk =
    rollingTaxableTurnover >= VAT_THRESHOLD ? "Registration Required"
    : forwardLookTriggered ? "Forward-Look Trigger"
    : rollingTaxableTurnover >= 0.9 * VAT_THRESHOLD ? "High Risk"
    : rollingTaxableTurnover >= 0.8 * VAT_THRESHOLD ? "Warning"
    : "Low Risk";
  const riskColour =
    risk === "Registration Required" || risk === "Forward-Look Trigger" ? "text-red-700"
    : risk === "High Risk" ? "text-orange-700"
    : risk === "Warning" ? "text-yellow-700"
    : "text-green-700";

  function latestReviewForClient(clientId: string) {
    return savedReviews.find((r) => r.client_id === clientId);
  }
  function latestAlertForClient(clientId: string) {
    return vatAlerts.find((a) => a.client_id === clientId);
  }
  function reviewsForSelectedClient() {
    if (!selectedClientId) return [];
    return savedReviews.filter((r) => r.client_id === selectedClientId);
  }
  function alertsForSelectedClient() {
    if (!selectedClientId) return [];
    return vatAlerts.filter((a) => a.client_id === selectedClientId);
  }
  function connectionForClient(clientId: string, provider: "xero" | "quickbooks" | "freeagent") {
    return accountingConnections.find((c) => c.client_id === clientId && c.provider === provider);
  }

  const selectedClientReviews = reviewsForSelectedClient();
  const selectedClientAlerts = alertsForSelectedClient();
  const rollingPeriod = months.length > 0 ? `${months[0].month} to ${months[months.length - 1].month}` : "";
  const selectedXeroConnection = selectedClientId ? connectionForClient(selectedClientId, "xero") : undefined;

  if (!user) {
    return (
      <main className="min-h-screen bg-[#f2f7f8] p-6">
        <div className="mx-auto max-w-xl">
          <div className="mb-6 rounded-3xl bg-[#343b46] p-8 text-white">
            <p>Provided by Maddock & Co.</p>
            <h1 className="mt-2 text-4xl font-bold">VAT Checker Login</h1>
            <p className="mt-3 text-[#f2f7f8]">Secure access for accounting firms and client users.</p>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow">
            <div className="mb-4 flex gap-2 rounded-xl bg-slate-100 p-1">
              <button onClick={() => setAuthMode("signin")} className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold ${authMode === "signin" ? "bg-white shadow" : "text-slate-600"}`}>Sign in</button>
              <button onClick={() => setAuthMode("signup")} className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold ${authMode === "signup" ? "bg-white shadow" : "text-slate-600"}`}>Create account</button>
            </div>
            <label className="block text-sm font-medium">Email address</label>
            <input type="email" className="mb-4 mt-1 w-full rounded-xl border p-3" value={email} onChange={(e) => setEmail(e.target.value)} />
            <label className="block text-sm font-medium">Password</label>
            <input type="password" className="mb-4 mt-1 w-full rounded-xl border p-3" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button onClick={authMode === "signin" ? signIn : signUp} className="w-full rounded-xl bg-[#343b46] px-4 py-3 font-semibold text-white">
              {authMode === "signin" ? "Sign in" : "Create account"}
            </button>
            {loginMessage && <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm">{loginMessage}</p>}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f2f7f8] p-6">
      <div className="mx-auto max-w-7xl">

        {/* ── New Client Modal ─────────────────────────────── */}
        {showNewClientModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
              <div className="rounded-t-2xl bg-[#343b46] px-6 py-5 text-white">
                <h2 className="text-xl font-bold">Add new client</h2>
                <p className="mt-1 text-sm text-[#e8eef0]">Enter the client details below. You can connect Xero after saving.</p>
              </div>
              <div className="p-6">
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-slate-700">Client name <span className="text-red-500">*</span></label>
                  <input type="text" className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none focus:ring-2 focus:ring-[#c9af69]/20" placeholder="e.g. BMA Leisure Ltd" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} autoFocus />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-slate-700">Sector <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input type="text" className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none focus:ring-2 focus:ring-[#c9af69]/20" placeholder="e.g. Hospitality, Retail, Construction" value={newClientSector} onChange={(e) => setNewClientSector(e.target.value)} />
                </div>
                <div className="mb-6 rounded-xl bg-[#f2f7f8] p-3 text-sm text-[#343b46]">
                  <strong>Next step:</strong> After saving, open the client and click <strong>Connect Xero</strong> to link their accounting data.
                </div>
                {newClientError && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{newClientError}</div>}
                <div className="flex gap-3">
                  <button onClick={() => { setShowNewClientModal(false); setNewClientName(""); setNewClientSector(""); setNewClientError(""); }} className="flex-1 rounded-xl border border-[#c9af69] px-4 py-3 text-sm font-semibold text-[#343b46] hover:bg-slate-50">Cancel</button>
                  <button onClick={createNewClient} disabled={newClientSaving || !newClientName.trim()} className="flex-1 rounded-xl bg-[#343b46] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{newClientSaving ? "Saving..." : "Save client"}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Header ───────────────────────────────────────── */}
        <div className="mb-6 rounded-3xl bg-[#343b46] p-8 text-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[#c9af69] text-sm">Provided by Maddock & Co.</p>
              <h1 className="mt-1 text-4xl font-bold">VAT Checker</h1>
              {selectedClientId ? (
                <p className="mt-2 text-[#f2f7f8]">
                  Viewing: <span className="font-semibold text-white">{clientName}</span>
                </p>
              ) : (
                <p className="mt-2 text-[#f2f7f8]">Signed in as {user.email}</p>
              )}
            </div>
            <div className="flex gap-2">
              {selectedClientId && (
                <button
                  onClick={() => { setSelectedClientId(null); setClientName(""); setMessage(""); setMonths(getLastCompleted12Months()); }}
                  className="rounded-xl bg-white/20 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/30 hover:bg-white/30"
                >
                  ← Back to all clients
                </button>
              )}
              <button onClick={signOut} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20">Sign out</button>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            MAIN DASHBOARD VIEW — shown when no client is open
        ══════════════════════════════════════════════════════ */}
        {!selectedClientId && (
          <>
            {/* VAT alerts across all clients */}
            {vatAlerts.length > 0 && (
              <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 p-6 shadow">
                <h2 className="text-xl font-bold text-orange-900">⚠️ VAT alerts</h2>
                <p className="mt-1 text-sm text-orange-800">Clients approaching or exceeding the VAT registration threshold.</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-orange-200 text-left">
                        <th className="p-2">Client</th>
                        <th className="p-2">Alert</th>
                        <th className="p-2">% threshold</th>
                        <th className="p-2">Message</th>
                        <th className="p-2">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vatAlerts.slice(0, 10).map((alert) => {
                        const alertClient = savedClients.find((c) => c.id === alert.client_id);
                        return (
                          <tr key={alert.id} className="border-b border-orange-100 hover:bg-orange-100 cursor-pointer" onClick={() => { const c = savedClients.find(x => x.id === alert.client_id); if (c) openClient(c); }}>
                            <td className="p-2 font-medium">{alertClient?.name || "Unknown"}</td>
                            <td className="p-2 font-semibold">{alert.alert_type}</td>
                            <td className="p-2">{Number(alert.threshold_percentage || 0).toFixed(1)}%</td>
                            <td className="p-2">{alert.message}</td>
                            <td className="p-2">{new Date(alert.created_at).toLocaleString("en-GB")}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Client list */}
            <div className="mb-6 rounded-2xl bg-white p-6 shadow">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-bold">Client dashboard</h2>
                  <p className="text-sm text-slate-500">Click a client to open their full VAT details.</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setShowNewClientModal(true); setNewClientError(""); }} className="rounded-xl bg-[#343b46] px-4 py-2 text-sm font-semibold text-white">+ New client</button>
                  <button onClick={loadSavedData} className="rounded-xl bg-[#f2f7f8] px-4 py-2 text-sm font-semibold text-[#343b46]">{loadingSaved ? "Loading..." : "Refresh"}</button>
                </div>
              </div>

              {savedClients.length === 0 ? (
                <div className="rounded-xl bg-slate-50 p-8 text-center">
                  <p className="text-slate-500">No clients yet.</p>
                  <button onClick={() => { setShowNewClientModal(true); setNewClientError(""); }} className="mt-3 rounded-xl bg-[#343b46] px-5 py-2 text-sm font-semibold text-white">Add your first client</button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="p-2">Client</th>
                        <th className="p-2">Sector</th>
                        <th className="p-2">Latest turnover</th>
                        <th className="p-2">% threshold</th>
                        <th className="p-2">Risk</th>
                        <th className="p-2">Alert</th>
                        <th className="p-2">Xero</th>
                        <th className="p-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {savedClients.map((c) => {
                        const review = latestReviewForClient(c.id);
                        const latestAlert = latestAlertForClient(c.id);
                        const turnover = Number(review?.rolling_taxable_turnover || 0);
                        const percent = (turnover / VAT_THRESHOLD) * 100;
                        const xeroConn = connectionForClient(c.id, "xero");
                        const rowRisk = review?.risk_status || "No review";
                        const rowRiskColour =
                          turnover >= VAT_THRESHOLD ? "text-red-700"
                          : turnover >= VAT_THRESHOLD * 0.9 ? "text-orange-700"
                          : turnover >= VAT_THRESHOLD * 0.8 ? "text-yellow-700"
                          : "text-green-700";
                        return (
                          <tr key={c.id} className="border-b hover:bg-slate-50 cursor-pointer" onClick={() => openClient(c)}>
                            <td className="p-2 font-medium text-[#343b46]">{c.name}</td>
                            <td className="p-2">{c.sector || "-"}</td>
                            <td className="p-2">£{turnover.toLocaleString()}</td>
                            <td className="p-2">{percent.toFixed(1)}%</td>
                            <td className={`p-2 font-semibold ${rowRiskColour}`}>{rowRisk}</td>
                            <td className="p-2">
                              {latestAlert
                                ? <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">{latestAlert.alert_type}</span>
                                : <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">Clear</span>}
                            </td>
                            <td className="p-2">
                              {xeroConn
                                ? <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">Connected</span>
                                : <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Not connected</span>}
                            </td>
                            <td className="p-2">
                              <button onClick={(e) => { e.stopPropagation(); openClient(c); }} className="rounded-lg bg-[#343b46] px-3 py-1 text-sm font-semibold text-white hover:bg-[#2d3340]">Open</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════
            CLIENT DETAIL VIEW — shown when a client is open
        ══════════════════════════════════════════════════════ */}
        {selectedClientId && (
          <>
            {/* VAT summary cards for this client */}
            <div className="mb-6 grid gap-4 md:grid-cols-5">
              {[
                { label: "Rolling taxable turnover", value: `£${rollingTaxableTurnover.toLocaleString()}` },
                { label: "Threshold used", value: `${thresholdUsed.toFixed(1)}%` },
                { label: "Remaining to threshold", value: `£${thresholdRemaining.toLocaleString()}` },
                { label: "30-day forecast", value: `£${expectedNext30Days.toLocaleString()}` },
              ].map((card) => (
                <div key={card.label} className="rounded-xl bg-white p-4 shadow">
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <p className="text-2xl font-bold">{card.value}</p>
                </div>
              ))}
              <div className={`rounded-xl p-4 shadow ${
                risk === "Registration Required" || risk === "Forward-Look Trigger" ? "bg-red-50"
                : risk === "High Risk" ? "bg-orange-50"
                : risk === "Warning" ? "bg-yellow-50"
                : "bg-green-50"
              }`}>
                <p className="text-sm text-gray-500">VAT risk</p>
                <p className={`text-2xl font-bold ${riskColour}`}>{risk}</p>
              </div>
            </div>

            {/* Client alerts */}
            {selectedClientAlerts.length > 0 && (
              <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 p-6 shadow">
                <h2 className="text-xl font-bold text-orange-900">⚠️ Alerts — {clientName}</h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-orange-200 text-left">
                        <th className="p-2">Alert type</th>
                        <th className="p-2">% threshold</th>
                        <th className="p-2">Message</th>
                        <th className="p-2">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedClientAlerts.map((alert) => (
                        <tr key={alert.id} className="border-b border-orange-100">
                          <td className="p-2 font-semibold">{alert.alert_type}</td>
                          <td className="p-2">{Number(alert.threshold_percentage || 0).toFixed(1)}%</td>
                          <td className="p-2">{alert.message}</td>
                          <td className="p-2">{new Date(alert.created_at).toLocaleString("en-GB")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Xero connection */}
            <div className="mb-6 rounded-2xl bg-white p-6 shadow">
              <h2 className="text-xl font-bold">Xero connection</h2>
              <p className="mt-1 text-sm text-slate-500">Connect Xero and import income automatically.</p>
              <div className="mt-4 rounded-2xl border bg-slate-50 p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="font-semibold">Xero</h3>
                    <p className="text-sm text-slate-600">
                      {selectedXeroConnection
                        ? `Connected on ${new Date(selectedXeroConnection.connected_at).toLocaleDateString("en-GB")}`
                        : "Not connected. Make sure you are logged into the correct Xero organisation before connecting."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={connectXero} className="rounded-xl bg-[#343b46] px-4 py-2 text-sm font-semibold text-white">
                      {selectedXeroConnection ? "Reconnect Xero" : "Connect Xero"}
                    </button>
                    <button onClick={importFromXero} disabled={!selectedXeroConnection || importingXero} className="rounded-xl bg-[#c9af69] text-[#343b46] font-semibold px-4 py-2 text-sm disabled:opacity-50">
                      {importingXero ? "Importing..." : "Import from Xero"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Account mappings */}
            <div className="mb-6">
              <AccountMappings clientId={selectedClientId} clientName={clientName} />
            </div>

            {/* VAT review history */}
            <div className="mb-6 rounded-2xl bg-white p-6 shadow">
              <h2 className="text-xl font-bold">VAT review history</h2>
              {selectedClientReviews.length === 0 ? (
                <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No VAT review history yet.</p>
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
                        <tr key={review.id} className={index === 0 ? "border-b bg-[#f2f7f8]" : "border-b"}>
                          <td className="p-2">{new Date(review.created_at).toLocaleString("en-GB")}</td>
                          <td className="p-2 font-semibold">£{Number(review.rolling_taxable_turnover).toLocaleString()}</td>
                          <td className="p-2">{review.risk_status}</td>
                          <td className="p-2">{index === 0 ? "Latest" : `Previous ${index}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Manual turnover entry */}
            <div className="mb-6 grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl bg-white p-6 shadow">
                <h2 className="mb-3 font-bold">Firm</h2>
                <input className="w-full rounded border p-2" value={firmName} onChange={(e) => setFirmName(e.target.value)} />
              </div>
              <div className="rounded-2xl bg-white p-6 shadow">
                <h2 className="mb-3 font-bold">Client details</h2>
                <input className="mb-3 w-full rounded border p-2" placeholder="Client name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
                <input className="mb-3 w-full rounded border p-2" placeholder="Sector" value={sector} onChange={(e) => setSector(e.target.value)} />
                <label className="block text-sm font-medium">Expected taxable turnover in next 30 days</label>
                <input type="number" className="mt-1 w-full rounded border p-2" value={expectedNext30Days} onChange={(e) => setExpectedNext30Days(Number(e.target.value || 0))} />
              </div>
            </div>

            <div className="mb-3 flex justify-end">
              <button onClick={refreshRollingPeriod} className="rounded-xl bg-[#f2f7f8] px-4 py-2 text-sm font-semibold text-[#343b46]">Refresh 12-month period</button>
            </div>

            <div className="overflow-x-auto rounded-2xl bg-white p-6 shadow">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="p-2 text-left">Month</th>
                    <th className="p-2">Standard-rated</th>
                    <th className="p-2">Reduced-rated</th>
                    <th className="p-2">Zero-rated</th>
                    <th className="p-2">Exempt</th>
                    <th className="p-2">Out of scope</th>
                    <th className="p-2">Taxable total</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((month, index) => (
                    <tr key={month.month} className="border-b">
                      <td className="p-2 font-medium">{month.month}</td>
                      {(["standard", "reduced", "zero", "exempt", "out"] as VatField[]).map((field) => (
                        <td key={field} className="p-2">
                          <input type="number" className="w-28 rounded border p-2 text-sm" value={month[field]} onChange={(e) => updateValue(index, field, Number(e.target.value))} />
                        </td>
                      ))}
                      <td className="p-2 font-semibold text-[#343b46]">£{(month.standard + month.reduced + month.zero).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded-2xl bg-white p-5 text-sm text-slate-700 shadow">
              <strong>VAT logic:</strong> Standard-rated, reduced-rated and zero-rated income are included in taxable turnover. Exempt and out-of-scope income are excluded from the VAT registration threshold calculation.
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={saveAll} className="rounded-xl bg-[#343b46] px-6 py-3 font-semibold text-white disabled:opacity-50" disabled={saving}>
                {saving ? "Saving..." : "Save VAT Review"}
              </button>
              <button
                onClick={() => { setSelectedClientId(null); setClientName(""); setMessage(""); setMonths(getLastCompleted12Months()); }}
                className="rounded-xl border border-[#c9af69] px-6 py-3 font-semibold text-[#343b46] hover:bg-slate-50"
              >
                ← Back to all clients
              </button>
            </div>

            {message && <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm">{message}</p>}
          </>
        )}

      </div>
    </main>
  );
}
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
              {/* Modal header */}
              <div className="rounded-t-2xl bg-[#343b46] px-6 py-5 text-white">
                <h2 className="text-xl font-bold">Add new client</h2>
                <p className="mt-1 text-sm text-[#e8eef0]">Enter the client details below. You can connect Xero after saving.</p>
              </div>

              {/* Modal body */}
              <div className="p-6">
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-slate-700">Client name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none focus:ring-2 focus:ring-[#c9af69]/20"
                    placeholder="e.g. BMA Leisure Ltd"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-semibold text-slate-700">Sector <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input
                    type="text"
                    className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none focus:ring-2 focus:ring-[#c9af69]/20"
                    placeholder="e.g. Hospitality, Retail, Construction"
                    value={newClientSector}
                    onChange={(e) => setNewClientSector(e.target.value)}
                  />
                </div>

                <div className="mb-6 rounded-xl bg-[#f2f7f8] p-3 text-sm text-[#343b46]">
                  <strong>Next step:</strong> After saving, open the client and click <strong>Connect Xero</strong> to link their accounting data.
                </div>

                {newClientError && (
                  <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                    {newClientError}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowNewClientModal(false); setNewClientName(""); setNewClientSector(""); setNewClientError(""); }}
                    className="flex-1 rounded-xl border border-[#c9af69] px-4 py-3 text-sm font-semibold text-[#343b46] hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createNewClient}
                    disabled={newClientSaving || !newClientName.trim()}
                    className="flex-1 rounded-xl bg-[#343b46] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {newClientSaving ? "Saving..." : "Save client"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Header ───────────────────────────────────────── */}
        <div className="mb-6 rounded-3xl bg-[#343b46] p-8 text-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p>Provided by Maddock & Co.</p>
              <h1 className="mt-2 text-4xl font-bold">VAT Checker</h1>
              <p className="mt-2 text-[#f2f7f8]">Signed in as {user.email}</p>
              <p className="mt-1 text-sm text-[#f2f7f8]">Rolling period: {rollingPeriod}</p>
            </div>
            <button onClick={signOut} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20">Sign out</button>
          </div>
        </div>

        {/* ── Summary cards ────────────────────────────────── */}
        <div className="mb-6 grid gap-6 md:grid-cols-5">
          {[
            { label: "Rolling taxable turnover", value: `£${rollingTaxableTurnover.toLocaleString()}` },
            { label: "Threshold used", value: `${thresholdUsed.toFixed(1)}%` },
            { label: "Remaining", value: `£${thresholdRemaining.toLocaleString()}` },
            { label: "30-day forecast", value: `£${expectedNext30Days.toLocaleString()}` },
          ].map((card) => (
            <div key={card.label} className="rounded-xl bg-white p-4 shadow">
              <p className="text-sm text-gray-500">{card.label}</p>
              <p className="text-2xl font-bold">{card.value}</p>
            </div>
          ))}
          <div className="rounded-xl bg-white p-4 shadow">
            <p className="text-sm text-gray-500">Risk</p>
            <p className={`text-2xl font-bold ${riskColour}`}>{risk}</p>
          </div>
        </div>

        {/* ── VAT alerts ───────────────────────────────────── */}
        {vatAlerts.length > 0 && (
          <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 p-6 shadow">
            <h2 className="text-xl font-bold text-orange-900">VAT alerts</h2>
            <p className="mt-1 text-sm text-orange-800">Latest threshold alerts created by the VAT monitoring engine.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-orange-200 text-left">
                    <th className="p-2">Client</th>
                    <th className="p-2">Alert</th>
                    <th className="p-2">% threshold</th>
                    <th className="p-2">Message</th>
                    <th className="p-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {vatAlerts.slice(0, 10).map((alert) => {
                    const client = savedClients.find((c) => c.id === alert.client_id);
                    return (
                      <tr key={alert.id} className="border-b border-orange-100">
                        <td className="p-2 font-medium">{client?.name || "Unknown"}</td>
                        <td className="p-2 font-semibold">{alert.alert_type}</td>
                        <td className="p-2">{Number(alert.threshold_percentage || 0).toFixed(1)}%</td>
                        <td className="p-2">{alert.message}</td>
                        <td className="p-2">{new Date(alert.created_at).toLocaleString("en-GB")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Client list ──────────────────────────────────── */}
        <div className="mb-6 rounded-2xl bg-white p-6 shadow">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold">Client dashboard</h2>
              <p className="text-sm text-slate-500">All clients, latest turnover, threshold usage and VAT risk.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowNewClientModal(true); setNewClientError(""); }}
                className="rounded-xl bg-[#343b46] px-4 py-2 text-sm font-semibold text-white"
              >
                + New client
              </button>
              <button onClick={loadSavedData} className="rounded-xl bg-[#f2f7f8] px-4 py-2 text-sm font-semibold text-[#343b46]">
                {loadingSaved ? "Loading..." : "Refresh"}
              </button>
            </div>
          </div>

          {savedClients.length === 0 ? (
            <div className="rounded-xl bg-slate-50 p-8 text-center">
              <p className="text-slate-500">No clients yet.</p>
              <button
                onClick={() => { setShowNewClientModal(true); setNewClientError(""); }}
                className="mt-3 rounded-xl bg-[#343b46] px-5 py-2 text-sm font-semibold text-white"
              >
                Add your first client
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2">Client</th>
                    <th className="p-2">Sector</th>
                    <th className="p-2">Latest turnover</th>
                    <th className="p-2">% threshold</th>
                    <th className="p-2">Risk</th>
                    <th className="p-2">Alert</th>
                    <th className="p-2">Xero</th>
                    <th className="p-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {savedClients.map((client) => {
                    const review = latestReviewForClient(client.id);
                    const latestAlert = latestAlertForClient(client.id);
                    const turnover = Number(review?.rolling_taxable_turnover || 0);
                    const percent = (turnover / VAT_THRESHOLD) * 100;
                    const xeroConnection = connectionForClient(client.id, "xero");
                    const rowRisk = review?.risk_status || "No review";
                    const rowRiskColour =
                      turnover >= VAT_THRESHOLD ? "text-red-700"
                      : turnover >= VAT_THRESHOLD * 0.9 ? "text-orange-700"
                      : turnover >= VAT_THRESHOLD * 0.8 ? "text-yellow-700"
                      : "text-green-700";
                    return (
                      <tr key={client.id} className={`border-b ${selectedClientId === client.id ? "bg-[#f2f7f8]" : ""}`}>
                        <td className="p-2 font-medium">{client.name}</td>
                        <td className="p-2">{client.sector || "-"}</td>
                        <td className="p-2">£{turnover.toLocaleString()}</td>
                        <td className="p-2">{percent.toFixed(1)}%</td>
                        <td className={`p-2 font-semibold ${rowRiskColour}`}>{rowRisk}</td>
                        <td className="p-2">
                          {latestAlert ? (
                            <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">{latestAlert.alert_type}</span>
                          ) : (
                            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">Clear</span>
                          )}
                        </td>
                        <td className="p-2">
                          {xeroConnection ? (
                            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">Connected</span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Not connected</span>
                          )}
                        </td>
                        <td className="p-2">
                          <button onClick={() => openClient(client)} className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-semibold hover:bg-slate-200">
                            Open
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

        {/* ── Selected client alerts ───────────────────────── */}
        {selectedClientId && selectedClientAlerts.length > 0 && (
          <div className="mb-6 rounded-2xl border border-orange-200 bg-white p-6 shadow">
            <h2 className="text-xl font-bold">Alerts — {clientName}</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2">Alert type</th>
                    <th className="p-2">% threshold</th>
                    <th className="p-2">Message</th>
                    <th className="p-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedClientAlerts.map((alert) => (
                    <tr key={alert.id} className="border-b">
                      <td className="p-2 font-semibold">{alert.alert_type}</td>
                      <td className="p-2">{Number(alert.threshold_percentage || 0).toFixed(1)}%</td>
                      <td className="p-2">{alert.message}</td>
                      <td className="p-2">{new Date(alert.created_at).toLocaleString("en-GB")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Xero connection ──────────────────────────────── */}
        {selectedClientId && (
          <div className="mb-6 rounded-2xl bg-white p-6 shadow">
            <h2 className="text-xl font-bold">Xero connection — {clientName}</h2>
            <p className="mt-1 text-sm text-slate-500">Connect Xero and import income automatically.</p>
            <div className="mt-4 rounded-2xl border bg-slate-50 p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="font-semibold">Xero</h3>
                  <p className="text-sm text-slate-600">
                    {selectedXeroConnection
                      ? `Connected on ${new Date(selectedXeroConnection.connected_at).toLocaleDateString("en-GB")}`
                      : "Not connected yet. Make sure you are logged into the correct Xero organisation before connecting."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={connectXero} className="rounded-xl bg-[#343b46] px-4 py-2 text-sm font-semibold text-white">
                    {selectedXeroConnection ? "Reconnect Xero" : "Connect Xero"}
                  </button>
                  <button onClick={importFromXero} disabled={!selectedXeroConnection || importingXero} className="rounded-xl bg-[#c9af69] text-[#343b46] font-semibold px-4 py-2 text-sm disabled:opacity-50">
                    {importingXero ? "Importing..." : "Import from Xero"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Account mappings ─────────────────────────────── */}
        {selectedClientId && (
          <div className="mb-6">
            <AccountMappings clientId={selectedClientId} clientName={clientName} />
          </div>
        )}

        {/* ── VAT review history ───────────────────────────── */}
        {selectedClientId && (
          <div className="mb-6 rounded-2xl bg-white p-6 shadow">
            <h2 className="text-xl font-bold">VAT review history — {clientName}</h2>
            {selectedClientReviews.length === 0 ? (
              <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No VAT review history yet.</p>
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
                      <tr key={review.id} className={index === 0 ? "border-b bg-[#f2f7f8]" : "border-b"}>
                        <td className="p-2">{new Date(review.created_at).toLocaleString("en-GB")}</td>
                        <td className="p-2 font-semibold">£{Number(review.rolling_taxable_turnover).toLocaleString()}</td>
                        <td className="p-2">{review.risk_status}</td>
                        <td className="p-2">{index === 0 ? "Latest" : `Previous ${index}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Manual turnover entry ────────────────────────── */}
        {selectedClientId && (
          <>
            <div className="mb-6 grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl bg-white p-6 shadow">
                <h2 className="mb-3 font-bold">Firm</h2>
                <input className="w-full rounded border p-2" value={firmName} onChange={(e) => setFirmName(e.target.value)} />
              </div>
              <div className="rounded-2xl bg-white p-6 shadow">
                <h2 className="mb-3 font-bold">Editing — {clientName}</h2>
                <input className="mb-3 w-full rounded border p-2" placeholder="Client name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
                <input className="mb-3 w-full rounded border p-2" placeholder="Sector" value={sector} onChange={(e) => setSector(e.target.value)} />
                <label className="block text-sm font-medium">Expected taxable turnover in next 30 days</label>
                <input type="number" className="mt-1 w-full rounded border p-2" value={expectedNext30Days} onChange={(e) => setExpectedNext30Days(Number(e.target.value || 0))} />
              </div>
            </div>

            <div className="mb-3 flex justify-end">
              <button onClick={refreshRollingPeriod} className="rounded-xl bg-[#f2f7f8] px-4 py-2 text-sm font-semibold text-[#343b46]">
                Refresh latest 12-month period
              </button>
            </div>

            <div className="overflow-x-auto rounded-2xl bg-white p-6 shadow">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="p-2 text-left">Month</th>
                    <th className="p-2">Standard-rated</th>
                    <th className="p-2">Reduced-rated</th>
                    <th className="p-2">Zero-rated</th>
                    <th className="p-2">Exempt</th>
                    <th className="p-2">Out of scope</th>
                    <th className="p-2">Taxable total</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((month, index) => (
                    <tr key={month.month}>
                      <td className="p-2 font-medium">{month.month}</td>
                      {(["standard", "reduced", "zero", "exempt", "out"] as VatField[]).map((field) => (
                        <td key={field} className="p-2">
                          <input type="number" className="w-28 rounded border p-2" value={month[field]} onChange={(e) => updateValue(index, field, Number(e.target.value))} />
                        </td>
                      ))}
                      <td className="p-2 font-semibold">£{(month.standard + month.reduced + month.zero).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 rounded-2xl bg-white p-5 text-sm text-slate-700 shadow">
              <strong>VAT logic:</strong> Standard-rated, reduced-rated and zero-rated income are included in taxable turnover. Exempt and out-of-scope income are excluded from the VAT registration threshold calculation.
            </div>

            <button onClick={saveAll} className="mt-6 rounded bg-[#343b46] px-6 py-3 text-white" disabled={saving}>
              {saving ? "Saving..." : "Save VAT Review"}
            </button>
          </>
        )}

        {message && <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm">{message}</p>}
      </div>
    </main>
  );
}
