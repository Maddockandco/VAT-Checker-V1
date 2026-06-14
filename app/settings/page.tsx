// app/settings/page.tsx
// Firm settings page — logo upload, brand colour, contact details
// These feed into the white-label PDF reports

"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

type FirmSettings = {
  id: string;
  name: string;
  logo_url: string | null;
  primary_colour: string;
  website: string | null;
  phone: string | null;
  address: string | null;
  subscription_status: string;
  trial_ends_at: string | null;
};

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");
  const [firm, setFirm] = useState<FirmSettings | null>(null);
  const [firmId, setFirmId] = useState<string | null>(null);

  // Form fields
  const [firmName, setFirmName] = useState("");
  const [primaryColour, setPrimaryColour] = useState("#343b46");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    if (!supabase) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/dashboard"; return; }

    const { data: access } = await supabase
      .from("firm_user_access")
      .select("firm_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!access?.firm_id) { setLoading(false); return; }
    setFirmId(access.firm_id);

    const { data: firmData } = await supabase
      .from("firms")
      .select("id,name,logo_url,primary_colour,website,phone,address,subscription_status,trial_ends_at")
      .eq("id", access.firm_id)
      .single();

    if (firmData) {
      setFirm(firmData as FirmSettings);
      setFirmName(firmData.name || "");
      setPrimaryColour(firmData.primary_colour || "#343b46");
      setWebsite(firmData.website || "");
      setPhone(firmData.phone || "");
      setAddress(firmData.address || "");
      setLogoUrl(firmData.logo_url || null);
    }
    setLoading(false);
  }

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    if (!supabase || !firmId || !e.target.files?.[0]) return;
    const file = e.target.files[0];

    // Validate file size (2MB max)
    if (file.size > 2097152) {
      setMessage("Logo must be under 2MB.");
      setMessageType("error");
      return;
    }

    // Validate file type
    const allowedTypes = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setMessage("Please upload a PNG, JPG, SVG or WebP image.");
      setMessageType("error");
      return;
    }

    setUploading(true);
    setMessage("Uploading logo...");
    setMessageType("info");

    try {
      const ext = file.name.split(".").pop();
      const filePath = `${firmId}/logo.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("firm-logos")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw new Error(uploadError.message);

      const { data: { publicUrl } } = supabase.storage
        .from("firm-logos")
        .getPublicUrl(filePath);

      // Add cache buster to force refresh
      const urlWithCache = `${publicUrl}?t=${Date.now()}`;
      setLogoUrl(urlWithCache);

      // Save to firms table
      await supabase
        .from("firms")
        .update({ logo_url: publicUrl })
        .eq("id", firmId);

      setMessage("✅ Logo uploaded successfully!");
      setMessageType("success");
    } catch (err) {
      setMessage(`❌ Upload failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      setMessageType("error");
    }
    setUploading(false);
  }

  async function removeLogo() {
    if (!supabase || !firmId) return;
    await supabase.from("firms").update({ logo_url: null }).eq("id", firmId);
    setLogoUrl(null);
    setMessage("✅ Logo removed.");
    setMessageType("success");
  }

  async function saveSettings() {
    if (!supabase || !firmId) return;
    setSaving(true);
    setMessage("");

    const { error } = await supabase
      .from("firms")
      .update({
        name: firmName.trim(),
        primary_colour: primaryColour,
        website: website.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
      })
      .eq("id", firmId);

    if (error) {
      setMessage(`❌ Failed to save: ${error.message}`);
      setMessageType("error");
    } else {
      setMessage("✅ Settings saved successfully!");
      setMessageType("success");
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f2f7f8] flex items-center justify-center" style={{ fontFamily: "'Open Sans', sans-serif" }}>
        <p className="text-slate-500">Loading settings...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f2f7f8] p-6" style={{ fontFamily: "'Open Sans', sans-serif" }}>
      <div className="mx-auto max-w-3xl">

        {/* Header */}
        <div className="mb-6 rounded-3xl p-8 text-white" style={{ backgroundColor: primaryColour }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "#c9af69" }}>Maddock & Co.</p>
              <h1 className="text-3xl font-bold">Firm Settings</h1>
              <p className="mt-1 text-sm opacity-70">Manage your firm's branding and contact details</p>
            </div>
            <Link href="/dashboard" className="rounded-xl px-4 py-2 text-sm font-semibold text-white border border-white/20 bg-white/10 hover:bg-white/20 transition-colors">
              ← Back to dashboard
            </Link>
          </div>
        </div>

        {/* Subscription status */}
        {firm && (
          <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#343b46]">{firm.name}</p>
              <p className="text-xs text-slate-500 mt-1">
                {firm.subscription_status === "trial"
                  ? `Free trial${firm.trial_ends_at ? ` — expires ${new Date(firm.trial_ends_at).toLocaleDateString("en-GB")}` : ""}`
                  : firm.subscription_status}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${firm.subscription_status === "trial" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
              {firm.subscription_status === "trial" ? "Free Trial" : "Active"}
            </span>
          </div>
        )}

        {/* Logo upload */}
        <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[#343b46] mb-1">Firm Logo</h2>
          <p className="text-sm text-slate-500 mb-4">Your logo appears on VAT threshold reports. PNG, JPG, SVG or WebP, max 2MB.</p>

          <div className="flex items-center gap-6">
            {/* Logo preview */}
            <div className="w-32 h-20 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center bg-slate-50 overflow-hidden">
              {logoUrl
                ? <img src={logoUrl} alt="Firm logo" className="max-w-full max-h-full object-contain p-2" />
                : <p className="text-xs text-slate-400 text-center px-2">No logo uploaded</p>}
            </div>

            <div className="flex flex-col gap-2">
              <label className="cursor-pointer">
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={uploadLogo} className="hidden" disabled={uploading} />
                <span className="inline-block rounded-xl bg-[#343b46] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2a303a] transition-colors cursor-pointer">
                  {uploading ? "Uploading..." : "Upload logo"}
                </span>
              </label>
              {logoUrl && (
                <button onClick={removeLogo} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors">
                  Remove logo
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Brand colour */}
        <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[#343b46] mb-1">Brand Colour</h2>
          <p className="text-sm text-slate-500 mb-4">Used as the header colour on PDF reports. Default is Maddock & Co. dark slate.</p>

          <div className="flex items-center gap-4">
            <input
              type="color"
              value={primaryColour}
              onChange={(e) => setPrimaryColour(e.target.value)}
              className="w-14 h-14 rounded-xl cursor-pointer border border-slate-200"
            />
            <div>
              <p className="text-sm font-semibold text-[#343b46]">Selected colour</p>
              <p className="text-xs text-slate-500 font-mono mt-1">{primaryColour}</p>
            </div>
            <div className="ml-4 rounded-xl px-6 py-3 text-white text-sm font-semibold" style={{ backgroundColor: primaryColour }}>
              Preview
            </div>
            <button onClick={() => setPrimaryColour("#343b46")} className="text-xs text-slate-400 hover:text-slate-600">
              Reset to default
            </button>
          </div>
        </div>

        {/* Contact details */}
        <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[#343b46] mb-1">Firm Details</h2>
          <p className="text-sm text-slate-500 mb-4">These appear in the footer of your PDF reports.</p>

          <div className="grid gap-4">
            <div>
              <label className="block text-sm font-semibold text-[#343b46] mb-1">Firm name</label>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none"
                value={firmName}
                onChange={(e) => setFirmName(e.target.value)}
                placeholder="e.g. Smith & Co. Accountants"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#343b46] mb-1">Website</label>
              <input
                type="url"
                className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="e.g. https://www.smithco.com"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#343b46] mb-1">Phone number</label>
              <input
                type="tel"
                className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 01234 567890"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#343b46] mb-1">Address</label>
              <textarea
                className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 123 High Street, London, EC1A 1BB"
                rows={2}
              />
            </div>
          </div>
        </div>

        {/* Report preview */}
        <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[#343b46] mb-1">Report Preview</h2>
          <p className="text-sm text-slate-500 mb-4">This is how your firm's header will appear on PDF reports.</p>
          <div className="rounded-xl overflow-hidden border border-slate-100">
            <div className="p-6 text-white flex justify-between items-start" style={{ backgroundColor: primaryColour }}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "#c9af69" }}>VAT Threshold Report</p>
                <h3 className="text-xl font-bold">Rolling 12-month taxable turnover analysis</h3>
                <p className="text-xs opacity-60 mt-1">Report date: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
              </div>
              <div className="text-right">
                {logoUrl
                  ? <img src={logoUrl} alt="Logo" className="max-h-12 max-w-32 object-contain mb-1" />
                  : <p className="text-sm font-bold">{firmName || "Your Firm Name"}</p>}
                <p className="text-xs opacity-60">VAT Checker Report</p>
              </div>
            </div>
            <div className="p-3 bg-slate-50 text-right text-xs text-slate-400">
              Powered by <span className="font-semibold" style={{ color: "#c9af69" }}>Maddock & Co. VAT Checker</span>
            </div>
          </div>
        </div>

        {/* Save button */}
        {message && (
          <div className={`mb-4 rounded-xl p-3 text-sm border-l-4 ${
            messageType === "success" ? "bg-green-50 border-green-400 text-green-800"
            : messageType === "error" ? "bg-red-50 border-red-400 text-red-800"
            : "bg-[#f2f7f8] border-[#c9af69] text-[#343b46]"
          }`}>
            {message}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="rounded-xl bg-[#343b46] px-6 py-3 font-semibold text-white hover:bg-[#2a303a] transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save settings"}
          </button>
          <Link href="/dashboard" className="rounded-xl border border-[#c9af69] px-6 py-3 font-semibold text-[#343b46] hover:bg-[#f2f7f8] transition-colors">
            ← Back to dashboard
          </Link>
        </div>

      </div>
    </main>
  );
}
