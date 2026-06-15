"use client";

import React, { useEffect, useState } from "react";
import { createClient, type User } from "@supabase/supabase-js";
import AccountMappings from "@/components/AccountMappings";

// Maddock & Co brand colours
// Primary dark:  #343b46
// Gold accent:   #c9af69
// Light bg:      #f2f7f8

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
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginMessage, setLoginMessage] = useState("");

  const [firmName, setFirmName] = useState("Maddock & Co.");
  const [clientName, setClientName] = useState("");
  const [sector, setSector] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [expectedNext30Days, setExpectedNext30Days] = useState(0);

  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [importingXero, setImportingXero] = useState(false);
  const [sendingAlert, setSendingAlert] = useState(false);
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>("trial");
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [archiveDeleteLoading, setArchiveDeleteLoading] = useState(false);
  const [archiveDeleteMessage, setArchiveDeleteMessage] = useState("");

  const [savedClients, setSavedClients] = useState<SavedClient[]>([]);
  const [savedReviews, setSavedReviews] = useState<SavedReview[]>([]);
  const [accountingConnections, setAccountingConnections] = useState<AccountingConnection[]>([]);
  const [vatAlerts, setVatAlerts] = useState<VatAlert[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  const [months, setMonths] = useState<MonthRow[]>(getLastCompleted12Months());

  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientContactName, setNewClientContactName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientSector, setNewClientSector] = useState("");
  const [newClientSaving, setNewClientSaving] = useState(false);
  const [newClientError, setNewClientError] = useState("");

  const [showOrgPicker, setShowOrgPicker] = useState(false);
  const [orgPickerClientId, setOrgPickerClientId] = useState<string | null>(null);
  const [orgPickerOrgs, setOrgPickerOrgs] = useState<Array<{ tenantId: string; tenantName: string }>>([]);
  const [orgPickerSaving, setOrgPickerSaving] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser(data.user);
        loadSavedData().then((clients) => {
          // After loading, check if a client is in the URL and auto-open it
          const params = new URLSearchParams(window.location.search);
          const clientParam = params.get("client");
          if (clientParam && clients) {
            const clientToOpen = clients.find((c: SavedClient) => c.id === clientParam);
            if (clientToOpen) openClient(clientToOpen);
          }
        });
      } else {
        // No active session — show the login screen (already handled by !user check below)
        setUser(null);
      }
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user) loadSavedData();
    });

    const params = new URLSearchParams(window.location.search);
    const xeroStatus = params.get("xero");
    const pickClientId = params.get("clientId");
    const orgsParam = params.get("orgs");

    if (xeroStatus === "pick_org" && pickClientId && orgsParam) {
      try {
        const orgs = JSON.parse(decodeURIComponent(orgsParam));
        setOrgPickerClientId(pickClientId);
        setOrgPickerOrgs(orgs);
        setShowOrgPicker(true);
        window.history.replaceState({}, "", "/dashboard");
      } catch { /* ignore */ }
    } else if (xeroStatus === "connected") {
      setMessage("Xero connected successfully!");
      window.history.replaceState({}, "", "/dashboard");
    } else if (xeroStatus === "error") {
      setMessage("Xero connection failed. Please try again.");
      window.history.replaceState({}, "", "/dashboard");
    }

    return () => subscription.unsubscribe();
  }, []);

  async function loadSavedData() {
    if (!supabase) return [];
    setLoadingSaved(true);

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) { setLoadingSaved(false); return []; }

    const { data: firmAccess } = await supabase
      .from("firm_user_access")
      .select("firm_id")
      .eq("user_id", currentUser.id)
      .limit(1)
      .single();

    if (!firmAccess?.firm_id) {
      setSavedClients([]); setSavedReviews([]); setAccountingConnections([]); setVatAlerts([]);
      setLoadingSaved(false);
      return [];
    }

    const firmId = firmAccess.firm_id;

    const { data: firmData } = await supabase
      .from("firms")
      .select("trial_ends_at,subscription_status,stripe_plan")
      .eq("id", firmId)
      .single();

    if (firmData?.trial_ends_at) {
      const daysLeft = Math.ceil(
        (new Date(firmData.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      setTrialDaysLeft(daysLeft > 0 ? daysLeft : 0);
    }
    setSubscriptionStatus(firmData?.subscription_status || "trial");
    setCurrentPlan(firmData?.stripe_plan || null);

    const { data: clients } = await supabase
      .from("clients")
      .select("id,name,sector,firm_id,created_at")
      .eq("firm_id", firmId)
      .eq("archived", false)
      .order("created_at", { ascending: false });

    const clientIds = (clients || []).map((c) => c.id);

    const { data: reviews } = clientIds.length > 0
      ? await supabase.from("vat_reviews").select("id,client_id,rolling_taxable_turnover,risk_status,created_at").in("client_id", clientIds).order("created_at", { ascending: false })
      : { data: [] };

    const { data: connections } = clientIds.length > 0
      ? await supabase.from("accounting_connections").select("id,client_id,provider,provider_tenant_id,connected_at").in("client_id", clientIds).order("connected_at", { ascending: false })
      : { data: [] };

    const { data: alerts } = clientIds.length > 0
      ? await supabase.from("vat_alerts").select("id,client_id,threshold_percentage,alert_type,message,created_at").in("client_id", clientIds).order("created_at", { ascending: false })
      : { data: [] };

    setSavedClients((clients || []) as SavedClient[]);
    setSavedReviews((reviews || []) as SavedReview[]);
    setAccountingConnections((connections || []) as AccountingConnection[]);
    setVatAlerts((alerts || []) as VatAlert[]);
    setLoadingSaved(false);
    return (clients || []) as SavedClient[];
  }

  async function openClient(client: SavedClient) {
    if (!supabase) return;
    setSelectedClientId(client.id);
    setClientName(client.name);
    setSector(client.sector || "");
    setMessage("");
    // Persist client in URL so page refresh keeps you on the same client
    window.history.replaceState({}, "", `/dashboard?client=${client.id}`);
    const baseMonths = getLastCompleted12Months();
    const { data: entries } = await supabase
      .from("turnover_entries")
      .select("month_label,standard_rated,reduced_rated,zero_rated,exempt,out_of_scope,source")
      .eq("client_id", client.id);
    const loadedMonths = baseMonths.map((month) => {
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
    setMonths(loadedMonths);
    setExpectedNext30Days(0);
  }

  function closeClient() {
    setSelectedClientId(null);
    setClientName("");
    setMessage("");
    setMonths(getLastCompleted12Months());
    // Clear client from URL
    window.history.replaceState({}, "", "/dashboard");
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

  async function archiveClient() {
    if (!selectedClientId) return;
    setArchiveDeleteLoading(true);
    setArchiveDeleteMessage("");
    try {
      const res = await fetch("/api/clients/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: selectedClientId, action: "archive" }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowArchiveConfirm(false);
        await loadSavedData();
        closeClient();
        setMessage(`✅ ${data.message}`);
      } else {
        setArchiveDeleteMessage(`❌ ${data.error}`);
      }
    } catch (err) {
      setArchiveDeleteMessage(`❌ ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setArchiveDeleteLoading(false);
  }

  async function deleteClient() {
    if (!selectedClientId) return;
    setArchiveDeleteLoading(true);
    setArchiveDeleteMessage("");
    try {
      const res = await fetch("/api/clients/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: selectedClientId, action: "delete" }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowDeleteConfirm(false);
        await loadSavedData();
        closeClient();
        setMessage(`✅ ${data.message}`);
      } else {
        setArchiveDeleteMessage(`❌ ${data.error}`);
      }
    } catch (err) {
      setArchiveDeleteMessage(`❌ ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setArchiveDeleteLoading(false);
  }

  async function sendAlertEmail() {
    if (!selectedClientId) return;
    setSendingAlert(true);
    setMessage("Sending alert emails...");
    try {
      const res = await fetch("/api/alerts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: selectedClientId }),
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        setMessage(`❌ Server error: ${text.substring(0, 200)}`);
        setSendingAlert(false);
        return;
      }
      if (data.ok) {
        setMessage(`✅ Alert sent to: ${data.emailsSent?.join(", ") || "no recipients configured"}`);
        await loadSavedData();
      } else {
        setMessage(`❌ Alert failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      setMessage(`❌ Network error: ${err instanceof Error ? err.message : String(err)}`);
    }
    setSendingAlert(false);
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

  async function selectXeroOrg(tenantId: string) {
    if (!orgPickerClientId) return;
    setOrgPickerSaving(true);
    try {
      const res = await fetch("/api/xero/select-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: orgPickerClientId, tenantId }),
      });
      if (res.ok) {
        setShowOrgPicker(false);
        setOrgPickerClientId(null);
        setOrgPickerOrgs([]);
        await loadSavedData();
        const connectedClient = savedClients.find((c) => c.id === orgPickerClientId);
        if (connectedClient) await openClient(connectedClient);
        setMessage("Xero connected successfully!");
      } else {
        setMessage("Failed to save Xero organisation. Please try again.");
      }
    } catch {
      setMessage("Failed to save Xero organisation. Please try again.");
    }
    setOrgPickerSaving(false);
  }

  function getClientLimit(): number {
    if (subscriptionStatus === "active") {
      if (currentPlan === "unlimited") return Infinity;
      if (currentPlan === "growth_max") return 40;
      if (currentPlan === "growth_pro") return 30;
      if (currentPlan === "growth") return 20;
      if (currentPlan === "starter") return 10;
      if (currentPlan === "solo") return 1;
    }
    // Trial — allow up to 3 clients for testing
    return 3;
  }

  async function createNewClient() {
    setNewClientError("");
    if (!supabase) { setNewClientError("Supabase not connected."); return; }
    if (!user) { setNewClientError("Please sign in first."); return; }
    if (!newClientName.trim()) { setNewClientError("Please enter a client name."); return; }

    // Check client limit
    const limit = getClientLimit();
    if (savedClients.length >= limit) {
      if (subscriptionStatus === "trial") {
        setNewClientError(`Your free trial allows up to ${limit} clients. Please upgrade to add more.`);
      } else {
        setNewClientError(`You've reached your plan limit of ${limit} clients. Please upgrade your plan to add more.`);
      }
      return;
    }

    setNewClientSaving(true);
    try {
      // Upsert user profile
      await supabase.from("user_profiles").upsert({ id: user.id, email: user.email, role: "firm_admin" });

      // Look up existing firm for this user — reuse it if found
      let firmId: string | null = null;
      const { data: existingAccess } = await supabase
        .from("firm_user_access")
        .select("firm_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (existingAccess?.firm_id) {
        // Reuse existing firm
        firmId = existingAccess.firm_id;
      } else {
        // Create a new firm only if one doesn't exist
        const { data: firm, error: firmError } = await supabase
          .from("firms")
          .insert({ name: firmName, subscription_status: "trial" })
          .select()
          .single();
        if (firmError || !firm) throw new Error(`Firm error: ${firmError?.message}`);
        await supabase.from("firm_user_access").insert({ firm_id: firm.id, user_id: user.id, role: "firm_admin" });
        firmId = firm.id;
      }

      // Create the client under the firm
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .insert({
          firm_id: firmId,
          name: newClientName.trim(),
          sector: newClientSector.trim() || null,
          email: newClientEmail.trim() || null,
          contact_name: newClientContactName.trim() || null,
        })
        .select()
        .single();
      if (clientError || !client) throw new Error(`Client error: ${clientError?.message}`);

      setShowNewClientModal(false);
      setNewClientName(""); setNewClientContactName(""); setNewClientEmail(""); setNewClientSector("");
      await loadSavedData();
      await openClient(client as SavedClient);
      setMessage(`Client "${client.name}" created. Connect Xero below to import their data.`);
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
    if (!selectedClientId) { setMessage("Please create a client first."); return; }
    setSaving(true);
    await supabase.from("clients").update({ name: clientName, sector }).eq("id", selectedClientId);
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
    await supabase.from("turnover_entries").insert(entries);
    const rollingTaxableTurnover = months.reduce((sum, m) => sum + m.standard + m.reduced + m.zero, 0);
    const forwardLookTriggered = expectedNext30Days > VAT_THRESHOLD;
    const risk =
      rollingTaxableTurnover >= VAT_THRESHOLD ? "Registration Required"
      : forwardLookTriggered ? "Forward-Look Trigger"
      : rollingTaxableTurnover >= 0.9 * VAT_THRESHOLD ? "High Risk"
      : rollingTaxableTurnover >= 0.8 * VAT_THRESHOLD ? "Warning"
      : "Low Risk";
    await supabase.from("vat_reviews").insert({ client_id: selectedClientId, rolling_taxable_turnover: rollingTaxableTurnover, expected_next_30_days: expectedNext30Days, risk_status: risk });
    setSaving(false);
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
    risk === "Registration Required" || risk === "Forward-Look Trigger" ? "text-red-600"
    : risk === "High Risk" ? "text-orange-600"
    : risk === "Warning" ? "text-yellow-600"
    : "text-green-600";

  function latestReviewForClient(clientId: string) { return savedReviews.find((r) => r.client_id === clientId); }
  function latestAlertForClient(clientId: string) { return vatAlerts.find((a) => a.client_id === clientId); }
  function reviewsForSelectedClient() { if (!selectedClientId) return []; return savedReviews.filter((r) => r.client_id === selectedClientId); }
  function alertsForSelectedClient() { if (!selectedClientId) return []; return vatAlerts.filter((a) => a.client_id === selectedClientId); }
  function connectionForClient(clientId: string, provider: "xero" | "quickbooks" | "freeagent") { return accountingConnections.find((c) => c.client_id === clientId && c.provider === provider); }

  const selectedClientReviews = reviewsForSelectedClient();
  const selectedClientAlerts = alertsForSelectedClient();
  const selectedXeroConnection = selectedClientId ? connectionForClient(selectedClientId, "xero") : undefined;
  const rollingPeriod = months.length > 0 ? `${months[0].month} – ${months[months.length - 1].month}` : "";

  if (authLoading) {
    return (
      <main className="min-h-screen bg-[#f2f7f8] flex items-center justify-center" style={{ fontFamily: "'Open Sans', sans-serif" }}>
        <div className="text-center">
          <div className="rounded-2xl bg-[#343b46] p-8 text-white mb-4 inline-block">
            <p className="text-xs text-[#c9af69] font-semibold uppercase tracking-widest mb-1">Maddock & Co.</p>
            <p className="text-xl font-bold">VAT Checker</p>
          </div>
          <p className="text-slate-400 text-sm">Loading...</p>
        </div>
      </main>
    );
  }

  // Trial expired lockout
  if (user && subscriptionStatus === "trial" && trialDaysLeft !== null && trialDaysLeft <= 0) {
    return (
      <main className="min-h-screen bg-[#f2f7f8] flex items-center justify-center p-6" style={{ fontFamily: "'Open Sans', sans-serif" }}>
        <div className="w-full max-w-md">
          <div className="mb-6 rounded-3xl bg-[#343b46] p-8 text-white text-center">
            <p className="text-xs text-[#c9af69] font-semibold uppercase tracking-widest mb-2">VATwatchHQ</p>
            <h1 className="text-3xl font-bold">Trial Expired</h1>
          </div>
          <div className="rounded-3xl bg-white p-8 shadow-sm text-center">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">⏰</span>
            </div>
            <h2 className="text-xl font-bold text-[#343b46] mb-3">Your free trial has ended</h2>
            <p className="text-slate-500 text-sm mb-6">Subscribe to continue monitoring your clients' VAT threshold positions and keep access to all your data.</p>
            <a href="/billing" className="block w-full rounded-xl bg-[#343b46] px-4 py-3 text-sm font-semibold text-white hover:bg-[#2a303a] transition-colors text-center mb-3">
              View plans & subscribe →
            </a>
            <button onClick={signOut} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#f2f7f8] p-6" style={{ fontFamily: "'Open Sans', sans-serif" }}>
        <div className="mx-auto max-w-xl">
          {/* Back to home */}
          <div className="mb-4 text-center">
            <a href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#343b46] transition-colors">
              ← Back to VATwatchHQ
            </a>
          </div>
          <div className="mb-6 rounded-3xl bg-[#343b46] p-8 text-white">
            <div className="flex items-center gap-1 mb-2">
              <span className="text-[#c9af69] font-bold text-xl tracking-tight">VAT</span>
              <span className="text-white font-bold text-xl tracking-tight">watchHQ</span>
            </div>
            <h1 className="mt-1 text-3xl font-bold">Sign in</h1>
            <p className="mt-2 text-slate-300 text-sm">Welcome back — sign in to your account.</p>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <label className="block text-sm font-semibold text-[#343b46]">Email address</label>
            <input type="email" className="mb-4 mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none" value={email} onChange={(e) => setEmail(e.target.value)} />
            <label className="block text-sm font-semibold text-[#343b46]">Password</label>
            <input type="password" className="mb-1 mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none" value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="mb-4 text-right">
              <a href="/reset-password" className="text-xs text-slate-400 hover:text-[#c9af69]">Forgot password?</a>
            </div>
            <button onClick={signIn} className="w-full rounded-xl bg-[#343b46] px-4 py-3 font-semibold text-white hover:bg-[#2a303a] transition-colors">
              Sign in
            </button>
            <p className="mt-4 text-center text-sm text-slate-500">
              New firm? <a href="/signup" className="font-semibold text-[#343b46] hover:text-[#c9af69]">Start your free trial →</a>
            </p>
            {loginMessage && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{loginMessage}</p>}
          </div>
          <p className="mt-4 text-center text-xs text-slate-400">
            <a href="/terms" className="hover:text-[#343b46]">Terms of Service</a>
            {" · "}
            <a href="/privacy" className="hover:text-[#343b46]">Privacy Policy</a>
            {" · "}
            <a href="https://www.maddockandco.com" className="hover:text-[#343b46]">maddockandco.com</a>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f2f7f8] p-6" style={{ fontFamily: "'Open Sans', sans-serif" }}>
      <div className="mx-auto max-w-7xl">

        {/* Org Picker Modal */}
        {showOrgPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
              <div className="rounded-t-2xl bg-[#343b46] px-6 py-5 text-white">
                <p className="text-xs text-[#c9af69] font-semibold uppercase tracking-wide mb-1">Xero Connection</p>
                <h2 className="text-xl font-bold">Select Xero Organisation</h2>
                <p className="mt-1 text-sm text-slate-300">Choose which Xero organisation to link to this client.</p>
              </div>
              <div className="p-6">
                <div className="space-y-3">
                  {orgPickerOrgs.map((org) => (
                    <button key={org.tenantId} onClick={() => selectXeroOrg(org.tenantId)} disabled={orgPickerSaving}
                      className="w-full rounded-xl border-2 border-slate-200 p-4 text-left hover:border-[#c9af69] hover:bg-[#f2f7f8] transition-all disabled:opacity-50">
                      <p className="font-semibold text-[#343b46]">{org.tenantName}</p>
                      <p className="text-xs text-slate-400 mt-1">{org.tenantId}</p>
                    </button>
                  ))}
                </div>
                <button onClick={() => { setShowOrgPicker(false); setOrgPickerClientId(null); setOrgPickerOrgs([]); }}
                  className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-[#343b46] hover:bg-[#f2f7f8]">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* New Client Modal */}
        {showNewClientModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
              <div className="rounded-t-2xl bg-[#343b46] px-6 py-5 text-white">
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[#c9af69] font-bold text-sm tracking-tight">VAT</span>
                  <span className="text-white font-bold text-sm tracking-tight">watchHQ</span>
                </div>
                <h2 className="text-xl font-bold">Add new client</h2>
                <p className="mt-1 text-sm text-slate-300">Enter the client details below.</p>
              </div>
              <div className="p-6">
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-[#343b46]">Client name <span className="text-red-500">*</span></label>
                  <input type="text" className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none" placeholder="e.g. BMA Leisure Ltd" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} autoFocus />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-[#343b46]">Contact name <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input type="text" className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none" placeholder="e.g. John Smith" value={newClientContactName} onChange={(e) => setNewClientContactName(e.target.value)} />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-[#343b46]">Client email <span className="text-slate-400 font-normal">(for VAT alerts)</span></label>
                  <input type="email" className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none" placeholder="e.g. client@example.com" value={newClientEmail} onChange={(e) => setNewClientEmail(e.target.value)} />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-[#343b46]">Sector <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input type="text" className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none" placeholder="e.g. Hospitality, Retail, Construction" value={newClientSector} onChange={(e) => setNewClientSector(e.target.value)} />
                </div>
                <div className="mb-6 rounded-xl bg-[#f2f7f8] p-3 text-sm text-[#343b46] border-l-4 border-[#c9af69]">
                  <strong>Next step:</strong> After saving, open the client and click <strong>Connect Xero</strong>.
                </div>
                {newClientError && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{newClientError}</div>}
                <div className="flex gap-3">
                  <button onClick={() => { setShowNewClientModal(false); setNewClientName(""); setNewClientContactName(""); setNewClientEmail(""); setNewClientSector(""); setNewClientError(""); }}
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-[#343b46] hover:bg-[#f2f7f8]">Cancel</button>
                  <button onClick={createNewClient} disabled={newClientSaving || !newClientName.trim()}
                    className="flex-1 rounded-xl bg-[#343b46] px-4 py-3 text-sm font-semibold text-white hover:bg-[#2a303a] disabled:opacity-50">
                    {newClientSaving ? "Saving..." : "Save client"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-6 rounded-3xl bg-[#343b46] p-8 text-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[#c9af69] font-bold text-2xl tracking-tight">VAT</span>
                <span className="text-white font-bold text-2xl tracking-tight">watchHQ</span>
              </div>
              {selectedClientId ? (
                <p className="text-slate-300 text-sm">Viewing: <span className="font-semibold text-white">{clientName}</span></p>
              ) : (
                <p className="text-slate-300 text-sm">{user.email} · Rolling period: {rollingPeriod}</p>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {selectedClientId && (
                <button onClick={closeClient} className="rounded-xl bg-[#c9af69] px-4 py-2 text-sm font-semibold text-[#343b46] hover:bg-[#b89d58] transition-colors">
                  ← All clients
                </button>
              )}
              {selectedClientId && (
                <a href={`/api/reports/vat?clientId=${selectedClientId}`} target="_blank" rel="noopener noreferrer"
                  className="rounded-xl bg-white/10 border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 transition-colors">
                  📄 Report
                </a>
              )}
              <a href="/" className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 transition-colors" title="Back to home">
                🏠 <span className="hidden sm:inline">Home</span>
              </a>
              <a href="/settings" className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 transition-colors" title="Firm settings">
                ⚙️ <span className="hidden sm:inline">Settings</span>
              </a>
              <a href="/billing" className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 transition-colors" title="Billing & plans">
                💳 <span className="hidden sm:inline">Billing</span>
              </a>
              <button onClick={signOut} className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 transition-colors" title="Sign out">
                Sign out
              </button>
            </div>
          </div>
        </div>

        {/* Trial expiry banner */}
        {trialDaysLeft !== null && trialDaysLeft <= 14 && (
          <div className={`mb-6 rounded-2xl p-4 flex items-center justify-between ${trialDaysLeft <= 3 ? "bg-red-50 border border-red-200" : "bg-yellow-50 border border-yellow-200"}`}>
            <div>
              <p className={`font-semibold text-sm ${trialDaysLeft <= 3 ? "text-red-800" : "text-yellow-800"}`}>
                {trialDaysLeft === 0 ? "⚠️ Your free trial has expired" : `⏰ Your free trial expires in ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"}`}
              </p>
              <p className={`text-xs mt-1 ${trialDaysLeft <= 3 ? "text-red-600" : "text-yellow-600"}`}>
                Upgrade to keep access to all your clients and automated imports.
              </p>
            </div>
            <a href="/billing" className="rounded-xl bg-[#343b46] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2a303a] transition-colors whitespace-nowrap ml-4">
              Upgrade now →
            </a>
          </div>
        )}

        {/* MAIN DASHBOARD */}
        {!selectedClientId && (
          <>
            {vatAlerts.length > 0 && (
              <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-orange-900">⚠️ VAT Alerts</h2>
                <p className="mt-1 text-sm text-orange-700">Clients approaching or exceeding the VAT registration threshold.</p>
                {/* Mobile: card view */}
                <div className="mt-4 md:hidden space-y-2">
                  {vatAlerts.slice(0, 5).map((alert) => {
                    const alertClient = savedClients.find((c) => c.id === alert.client_id);
                    return (
                      <div key={alert.id} className="rounded-xl bg-white p-3 border border-orange-100 cursor-pointer"
                        onClick={() => { const c = savedClients.find((x) => x.id === alert.client_id); if (c) openClient(c); }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-[#343b46] text-sm">{alertClient?.name || "Unknown"}</span>
                          <span className="font-bold text-orange-700 text-xs">{alert.alert_type}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-slate-500">{Number(alert.threshold_percentage || 0).toFixed(1)}% of threshold</p>
                          <p className="text-xs text-slate-400">{new Date(alert.created_at).toLocaleDateString("en-GB")}</p>
                        </div>
                      </div>
                    );
                  })}
                  {vatAlerts.length > 5 && (
                    <p className="text-xs text-orange-600 text-center pt-1">+{vatAlerts.length - 5} more alerts</p>
                  )}
                </div>
                {/* Desktop: table view */}
                <div className="mt-4 hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-orange-200 text-left text-xs uppercase tracking-wide text-orange-700">
                        <th className="pb-2 p-2">Client</th>
                        <th className="pb-2 p-2">Alert</th>
                        <th className="pb-2 p-2">% Threshold</th>
                        <th className="pb-2 p-2">Message</th>
                        <th className="pb-2 p-2">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vatAlerts.slice(0, 10).map((alert) => {
                        const alertClient = savedClients.find((c) => c.id === alert.client_id);
                        return (
                          <tr key={alert.id} className="border-b border-orange-100 hover:bg-orange-100 cursor-pointer transition-colors"
                            onClick={() => { const c = savedClients.find((x) => x.id === alert.client_id); if (c) openClient(c); }}>
                            <td className="p-2 font-semibold text-[#343b46]">{alertClient?.name || "Unknown"}</td>
                            <td className="p-2 font-bold text-orange-700">{alert.alert_type}</td>
                            <td className="p-2">{Number(alert.threshold_percentage || 0).toFixed(1)}%</td>
                            <td className="p-2">{alert.message}</td>
                            <td className="p-2 text-xs text-slate-500">{new Date(alert.created_at).toLocaleString("en-GB")}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-[#343b46]">Client Dashboard</h2>
                  <p className="text-sm text-slate-500">Click a client to view their full VAT position.</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setShowNewClientModal(true); setNewClientError(""); }}
                    className="rounded-xl bg-[#343b46] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2a303a] transition-colors">
                    + New client
                  </button>
                  <span className="rounded-xl bg-[#f2f7f8] px-4 py-2 text-sm text-slate-500">
                    {savedClients.length}/{getClientLimit() === Infinity ? "∞" : getClientLimit()} clients
                  </span>
                  <button onClick={loadSavedData}
                    className="rounded-xl bg-[#f2f7f8] px-4 py-2 text-sm font-semibold text-[#343b46] hover:bg-slate-200 transition-colors">
                    {loadingSaved ? "Loading..." : "Refresh"}
                  </button>
                </div>
              </div>

              {savedClients.length === 0 ? (
                <div className="rounded-xl bg-[#f2f7f8] p-10 text-center">
                  <p className="text-slate-500 mb-3">No clients yet. Add your first client to get started.</p>
                  <button onClick={() => { setShowNewClientModal(true); setNewClientError(""); }}
                    className="rounded-xl bg-[#343b46] px-5 py-2 text-sm font-semibold text-white hover:bg-[#2a303a]">
                    Add your first client
                  </button>
                </div>
              ) : (
                <>
                  {/* Mobile: card view */}
                  <div className="md:hidden space-y-3">
                    {savedClients.map((c) => {
                      const review = latestReviewForClient(c.id);
                      const latestAlert = latestAlertForClient(c.id);
                      const turnover = Number(review?.rolling_taxable_turnover || 0);
                      const percent = (turnover / VAT_THRESHOLD) * 100;
                      const xeroConn = connectionForClient(c.id, "xero");
                      const rowRisk = review?.risk_status || "No review";
                      const rowRiskColour =
                        turnover >= VAT_THRESHOLD ? "text-red-600 font-bold"
                        : turnover >= VAT_THRESHOLD * 0.9 ? "text-orange-600 font-semibold"
                        : turnover >= VAT_THRESHOLD * 0.8 ? "text-yellow-600 font-semibold"
                        : "text-green-600";
                      return (
                        <div key={c.id} className="rounded-xl bg-[#f2f7f8] p-4 cursor-pointer border border-slate-100 hover:border-[#c9af69] transition-colors"
                          onClick={() => openClient(c)}>
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="font-semibold text-[#343b46]">{c.name}</p>
                              {c.sector && <p className="text-xs text-slate-500 mt-0.5">{c.sector}</p>}
                            </div>
                            <span className={`text-sm font-semibold ${rowRiskColour}`}>{rowRisk}</span>
                          </div>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="h-2 flex-1 rounded-full bg-slate-200">
                              <div className={`h-2 rounded-full ${percent >= 100 ? "bg-red-500" : percent >= 80 ? "bg-yellow-400" : "bg-green-400"}`}
                                style={{ width: `${Math.min(percent, 100)}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-slate-600">{percent.toFixed(0)}%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-[#343b46]">£{turnover.toLocaleString()}</span>
                            <div className="flex gap-2">
                              {xeroConn
                                ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Xero ✓</span>
                                : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">No Xero</span>}
                              {latestAlert
                                ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">{latestAlert.alert_type}</span>
                                : <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Clear</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Desktop: table view */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400">
                          <th className="pb-3 p-2">Client</th>
                          <th className="pb-3 p-2">Sector</th>
                          <th className="pb-3 p-2">Turnover</th>
                          <th className="pb-3 p-2">% Threshold</th>
                          <th className="pb-3 p-2">Risk</th>
                          <th className="pb-3 p-2">Alert</th>
                          <th className="pb-3 p-2">Xero</th>
                          <th className="pb-3 p-2"></th>
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
                            turnover >= VAT_THRESHOLD ? "text-red-600 font-bold"
                            : turnover >= VAT_THRESHOLD * 0.9 ? "text-orange-600 font-semibold"
                            : turnover >= VAT_THRESHOLD * 0.8 ? "text-yellow-600 font-semibold"
                            : "text-green-600";
                          return (
                            <tr key={c.id} className="border-b hover:bg-[#f2f7f8] cursor-pointer transition-colors" onClick={() => openClient(c)}>
                              <td className="p-2 font-semibold text-[#343b46]">{c.name}</td>
                              <td className="p-2 text-slate-500">{c.sector || "—"}</td>
                              <td className="p-2 font-semibold">£{turnover.toLocaleString()}</td>
                              <td className="p-2">
                                <div className="flex items-center gap-2">
                                  <div className="h-2 w-20 rounded-full bg-slate-100">
                                    <div className={`h-2 rounded-full ${percent >= 100 ? "bg-red-500" : percent >= 80 ? "bg-yellow-400" : "bg-green-400"}`}
                                      style={{ width: `${Math.min(percent, 100)}%` }} />
                                  </div>
                                  <span className="text-xs">{percent.toFixed(0)}%</span>
                                </div>
                              </td>
                              <td className={`p-2 ${rowRiskColour}`}>{rowRisk}</td>
                              <td className="p-2">
                                {latestAlert
                                  ? <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-semibold text-orange-700">{latestAlert.alert_type}</span>
                                  : <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">Clear</span>}
                              </td>
                              <td className="p-2">
                                {xeroConn
                                  ? <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">Connected</span>
                                  : <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">Not connected</span>}
                              </td>
                              <td className="p-2">
                                <button onClick={(e) => { e.stopPropagation(); openClient(c); }}
                                  className="rounded-lg bg-[#343b46] px-3 py-1 text-xs font-semibold text-white hover:bg-[#2a303a] transition-colors">
                                  Open →
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* CLIENT DETAIL VIEW */}
        {selectedClientId && (
          <>
            <div className="mb-6 grid gap-4 md:grid-cols-5">
              <div className="rounded-xl bg-white p-4 shadow-sm border-t-4 border-[#c9af69]">
                <p className="text-xs text-slate-400 uppercase tracking-wide">Rolling taxable turnover</p>
                <p className="mt-1 text-2xl font-bold text-[#343b46]">£{rollingTaxableTurnover.toLocaleString()}</p>
              </div>
              <div className="rounded-xl bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-400 uppercase tracking-wide">Threshold used</p>
                <p className="mt-1 text-2xl font-bold text-[#343b46]">{thresholdUsed.toFixed(1)}%</p>
                <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                  <div className={`h-2 rounded-full transition-all ${thresholdUsed >= 100 ? "bg-red-500" : thresholdUsed >= 80 ? "bg-yellow-400" : "bg-green-400"}`}
                    style={{ width: `${Math.min(thresholdUsed, 100)}%` }} />
                </div>
              </div>
              <div className="rounded-xl bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-400 uppercase tracking-wide">Remaining</p>
                <p className="mt-1 text-2xl font-bold text-[#343b46]">£{thresholdRemaining.toLocaleString()}</p>
              </div>
              <div className="rounded-xl bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-400 uppercase tracking-wide">30-day forecast</p>
                <p className="mt-1 text-2xl font-bold text-[#343b46]">£{expectedNext30Days.toLocaleString()}</p>
              </div>
              <div className={`rounded-xl p-4 shadow-sm border-t-4 ${risk === "Registration Required" || risk === "Forward-Look Trigger" ? "border-red-500 bg-red-50" : risk === "High Risk" ? "border-orange-400 bg-orange-50" : risk === "Warning" ? "border-yellow-400 bg-yellow-50" : "border-green-400 bg-green-50"}`}>
                <p className="text-xs text-slate-400 uppercase tracking-wide">VAT Risk</p>
                <p className={`mt-1 text-xl font-bold ${riskColour}`}>{risk}</p>
              </div>
            </div>

            {selectedClientAlerts.length > 0 && (
              <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold text-orange-900">⚠️ Alerts — {clientName}</h2>
                  <span className="text-xs text-orange-600 bg-orange-100 rounded-full px-2 py-1">{selectedClientAlerts.length} alerts</span>
                </div>
                {/* Mobile: card view */}
                <div className="md:hidden space-y-2">
                  {selectedClientAlerts.slice(0, 5).map((alert) => (
                    <div key={alert.id} className="rounded-xl bg-white p-3 border border-orange-100">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-orange-700 text-sm">{alert.alert_type}</span>
                        <span className="text-xs text-slate-400">{Number(alert.threshold_percentage || 0).toFixed(1)}%</span>
                      </div>
                      <p className="text-xs text-slate-600 mb-1">{alert.message}</p>
                      <p className="text-xs text-slate-400">{new Date(alert.created_at).toLocaleDateString("en-GB")}</p>
                    </div>
                  ))}
                  {selectedClientAlerts.length > 5 && (
                    <p className="text-xs text-orange-600 text-center pt-1">+{selectedClientAlerts.length - 5} more alerts</p>
                  )}
                </div>
                {/* Desktop: table view */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-orange-200 text-left text-xs uppercase tracking-wide text-orange-600">
                        <th className="pb-2 p-2">Alert</th>
                        <th className="pb-2 p-2">%</th>
                        <th className="pb-2 p-2">Message</th>
                        <th className="pb-2 p-2">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedClientAlerts.map((alert) => (
                        <tr key={alert.id} className="border-b border-orange-100">
                          <td className="p-2 font-bold text-orange-700">{alert.alert_type}</td>
                          <td className="p-2">{Number(alert.threshold_percentage || 0).toFixed(1)}%</td>
                          <td className="p-2">{alert.message}</td>
                          <td className="p-2 text-xs text-slate-500">{new Date(alert.created_at).toLocaleString("en-GB")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-[#343b46]">Xero Connection</h2>
              <p className="mt-1 text-sm text-slate-500">Connect Xero and import income automatically.</p>
              <div className="mt-4 rounded-xl border border-slate-100 bg-[#f2f7f8] p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-[#343b46]">Xero</p>
                    <p className="text-sm text-slate-500 mt-1">
                      {selectedXeroConnection
                        ? `✓ Connected on ${new Date(selectedXeroConnection.connected_at).toLocaleDateString("en-GB")}`
                        : "Not connected. Make sure you are logged into the correct Xero organisation first."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={connectXero} className="rounded-xl bg-[#343b46] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2a303a] transition-colors">
                      {selectedXeroConnection ? "Reconnect Xero" : "Connect Xero"}
                    </button>
                    <button onClick={importFromXero} disabled={!selectedXeroConnection || importingXero}
                      className="rounded-xl bg-[#c9af69] px-4 py-2 text-sm font-semibold text-[#343b46] hover:bg-[#b89d58] transition-colors disabled:opacity-50">
                      {importingXero ? "Importing..." : "Import from Xero"}
                    </button>
                    <button onClick={sendAlertEmail} disabled={sendingAlert}
                      className="rounded-xl border border-[#343b46] px-4 py-2 text-sm font-semibold text-[#343b46] hover:bg-[#f2f7f8] transition-colors disabled:opacity-50">
                      {sendingAlert ? "Sending..." : "Send Alert Email"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <AccountMappings clientId={selectedClientId} clientName={clientName} />
            </div>

            <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-[#343b46]">VAT Review History</h2>
              {selectedClientReviews.length === 0 ? (
                <p className="mt-4 rounded-xl bg-[#f2f7f8] p-4 text-sm text-slate-500">No VAT review history yet.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400">
                        <th className="pb-2 p-2">Review date</th>
                        <th className="pb-2 p-2">Taxable turnover</th>
                        <th className="pb-2 p-2">Risk status</th>
                        <th className="pb-2 p-2">Version</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedClientReviews.map((review, index) => (
                        <tr key={review.id} className={`border-b transition-colors ${index === 0 ? "bg-[#f2f7f8]" : "hover:bg-slate-50"}`}>
                          <td className="p-2 text-slate-600">{new Date(review.created_at).toLocaleString("en-GB")}</td>
                          <td className="p-2 font-bold text-[#343b46]">£{Number(review.rolling_taxable_turnover).toLocaleString()}</td>
                          <td className="p-2">{review.risk_status}</td>
                          <td className="p-2 text-xs text-slate-400">{index === 0 ? "Latest" : `Previous ${index}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mb-6 grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl bg-white p-6 shadow-sm">
                <h2 className="mb-3 font-bold text-[#343b46]">Firm</h2>
                <input className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none" value={firmName} onChange={(e) => setFirmName(e.target.value)} />
              </div>
              <div className="rounded-2xl bg-white p-6 shadow-sm">
                <h2 className="mb-3 font-bold text-[#343b46]">Client Details</h2>
                <input className="mb-3 w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none" placeholder="Client name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
                <input className="mb-3 w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none" placeholder="Sector" value={sector} onChange={(e) => setSector(e.target.value)} />
                <label className="block text-sm font-semibold text-[#343b46]">Expected taxable turnover in next 30 days</label>
                <input type="number" className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none" value={expectedNext30Days} onChange={(e) => setExpectedNext30Days(Number(e.target.value || 0))} />
              </div>
            </div>

            <div className="mb-3 flex justify-end">
              <button onClick={refreshRollingPeriod} className="rounded-xl bg-[#f2f7f8] px-4 py-2 text-sm font-semibold text-[#343b46] hover:bg-slate-200 transition-colors">
                Refresh 12-month period
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-2 md:hidden">← Scroll to see all columns →</p>
            <div className="overflow-x-auto rounded-2xl bg-white p-4 md:p-6 shadow-sm">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-slate-400">
                    <th className="pb-3 p-2 text-left">Month</th>
                    <th className="pb-3 p-2">Standard</th>
                    <th className="pb-3 p-2">Reduced</th>
                    <th className="pb-3 p-2">Zero</th>
                    <th className="pb-3 p-2">Exempt</th>
                    <th className="pb-3 p-2">Out of scope</th>
                    <th className="pb-3 p-2">Taxable total</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((month, index) => (
                    <tr key={month.month} className="border-b hover:bg-[#f2f7f8] transition-colors">
                      <td className="p-2 font-semibold text-[#343b46] whitespace-nowrap">{month.month}</td>
                      {(["standard", "reduced", "zero", "exempt", "out"] as VatField[]).map((field) => (
                        <td key={field} className="p-2">
                          <input type="number" className="w-24 rounded-xl border border-slate-200 p-2 text-sm focus:border-[#c9af69] focus:outline-none text-center"
                            value={month[field]} onChange={(e) => updateValue(index, field, Number(e.target.value))} />
                        </td>
                      ))}
                      <td className="p-2 font-bold text-[#343b46] whitespace-nowrap">£{(month.standard + month.reduced + month.zero).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded-2xl bg-white p-5 text-sm text-slate-500 shadow-sm border-l-4 border-[#c9af69]">
              <strong className="text-[#343b46]">VAT logic:</strong> Standard-rated, reduced-rated and zero-rated income are included in taxable turnover. Exempt and out-of-scope income are excluded from the VAT registration threshold calculation.
            </div>

            <div className="mt-6 flex gap-3 flex-wrap">
              <button onClick={saveAll} disabled={saving} className="rounded-xl bg-[#343b46] px-6 py-3 font-semibold text-white hover:bg-[#2a303a] transition-colors disabled:opacity-50">
                {saving ? "Saving..." : "Save VAT Review"}
              </button>
              <button onClick={closeClient} className="rounded-xl border border-[#c9af69] px-6 py-3 font-semibold text-[#343b46] hover:bg-[#f2f7f8] transition-colors">
                ← Back to all clients
              </button>
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => setShowArchiveConfirm(true)}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-500 hover:border-yellow-400 hover:text-yellow-700 hover:bg-yellow-50 transition-colors"
                >
                  📦 Archive client
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-500 hover:border-red-400 hover:text-red-700 hover:bg-red-50 transition-colors"
                >
                  🗑️ Delete client
                </button>
              </div>
            </div>

            {/* Archive confirmation modal */}
            {showArchiveConfirm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
                  <div className="rounded-t-2xl bg-yellow-500 px-6 py-5 text-white">
                    <h2 className="text-xl font-bold">📦 Archive {clientName}?</h2>
                    <p className="mt-1 text-sm text-yellow-100">This client will be hidden from your dashboard</p>
                  </div>
                  <div className="p-6">
                    <p className="text-sm text-slate-600 mb-4">Archiving this client will:</p>
                    <ul className="text-sm text-slate-600 space-y-2 mb-6">
                      <li>✅ Hide them from your active client list</li>
                      <li>✅ Retain all data for <strong>6 years</strong> (Companies Act requirement)</li>
                      <li>✅ Send you a confirmation email</li>
                      <li>✅ Send a reminder email 30 days before data is deleted</li>
                      <li>✅ Auto-delete all data after 6 years</li>
                    </ul>
                    <div className="rounded-xl bg-yellow-50 border-l-4 border-yellow-400 p-3 text-sm text-yellow-800 mb-6">
                      You can restore an archived client at any time before the 6-year period expires.
                    </div>
                    {archiveDeleteMessage && (
                      <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{archiveDeleteMessage}</p>
                    )}
                    <div className="flex gap-3">
                      <button onClick={() => { setShowArchiveConfirm(false); setArchiveDeleteMessage(""); }} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        Cancel
                      </button>
                      <button
                        onClick={archiveClient}
                        disabled={archiveDeleteLoading}
                        className="flex-1 rounded-xl bg-yellow-500 px-4 py-3 text-sm font-semibold text-white hover:bg-yellow-600 disabled:opacity-50"
                      >
                        {archiveDeleteLoading ? "Archiving..." : "Yes, archive client"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Delete confirmation modal */}
            {showDeleteConfirm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
                  <div className="rounded-t-2xl bg-red-600 px-6 py-5 text-white">
                    <h2 className="text-xl font-bold">🗑️ Delete {clientName}?</h2>
                    <p className="mt-1 text-sm text-red-100">This action cannot be undone</p>
                  </div>
                  <div className="p-6">
                    <div className="rounded-xl bg-red-50 border-l-4 border-red-400 p-3 text-sm text-red-800 mb-4">
                      <strong>Warning:</strong> This will permanently delete all data for {clientName} including all imported transactions, VAT reviews, account mappings and alerts. This cannot be recovered.
                    </div>
                    <p className="text-sm text-slate-600 mb-6">
                      If you need to keep records, consider <strong>archiving</strong> instead — data is retained for 6 years.
                    </p>
                    {archiveDeleteMessage && (
                      <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{archiveDeleteMessage}</p>
                    )}
                    <div className="flex gap-3">
                      <button onClick={() => { setShowDeleteConfirm(false); setArchiveDeleteMessage(""); }} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        Cancel
                      </button>
                      <button
                        onClick={deleteClient}
                        disabled={archiveDeleteLoading}
                        className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {archiveDeleteLoading ? "Deleting..." : "Yes, permanently delete"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {message && (
              <p className={`mt-4 rounded-xl p-3 text-sm border-l-4 ${message.startsWith("✅") ? "bg-green-50 border-green-400 text-green-800" : message.startsWith("❌") ? "bg-red-50 border-red-400 text-red-800" : "bg-[#f2f7f8] border-[#c9af69] text-[#343b46]"}`}>
                {message}
              </p>
            )}
          </>
        )}

      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-xs text-slate-400">
        <a href="/terms" className="hover:text-[#343b46]">Terms of Service</a>
        {" · "}
        <a href="/privacy" className="hover:text-[#343b46]">Privacy Policy</a>
        {" · "}
        <a href="https://www.maddockandco.com" className="hover:text-[#343b46]">maddockandco.com</a>
        {" · "}
        <span>Powered by Maddock & Co. VAT Checker</span>
      </div>

    </main>
  );
}
