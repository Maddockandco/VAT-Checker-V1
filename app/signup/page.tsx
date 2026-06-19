// app/signup/page.tsx
// Self-service signup for new accounting firms
// Creates user account, firm and links them together

"use client";

import React, { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export default function SignupPage() {
  const [step, setStep] = useState<"form" | "success">("form");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isInvited, setIsInvited] = useState(false);

  const [firmName, setFirmName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invitedEmail = params.get("invited");
    if (invitedEmail) {
      setEmail(invitedEmail);
      setIsInvited(true);
    }
  }, []);

  async function handleSignup() {
    setError("");

    if (!isInvited && !firmName.trim()) { setError("Please enter your firm name."); return; }
    if (!fullName.trim()) { setError("Please enter your full name."); return; }
    if (!email.trim()) { setError("Please enter your email address."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    if (!agreedToTerms) { setError("Please agree to the terms to continue."); return; }
    if (!supabase) { setError("Connection error. Please try again."); return; }

    setSaving(true);
    try {
      // Create the user account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim() }
        }
      });

      if (authError) throw new Error(authError.message);
      if (!authData.user) throw new Error("Failed to create account.");

      // Call our setup API to create firm and link user
      // (or, if this email has a pending invite, the setup route links them
      // to the existing firm automatically instead of creating a new one)
      const res = await fetch("/api/signup/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: authData.user.id,
          firmName: firmName.trim() || undefined,
          fullName: fullName.trim(),
          email: email.trim(),
        }),
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to set up account.");

      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
    setSaving(false);
  }

  if (step === "success") {
    return (
      <main className="min-h-screen bg-[#f2f7f8] flex items-center justify-center p-6" style={{ fontFamily: "'Open Sans', sans-serif" }}>
        <div className="w-full max-w-md">
          <div className="rounded-3xl bg-[#343b46] p-8 text-white text-center mb-6">
            <div className="flex items-center justify-center gap-1">
              <span className="text-[#c9af69] font-bold text-lg">VAT</span>
              <span className="text-white font-bold text-lg">watchHQ</span>
            </div>
          </div>
          <div className="rounded-3xl bg-white p-8 shadow-sm text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✅</span>
            </div>
            <h2 className="text-xl font-bold text-[#343b46] mb-3">Account created!</h2>
            <p className="text-slate-500 text-sm mb-6">
              {isInvited
                ? <>Welcome to VATwatchHQ. Please check your email at <strong>{email}</strong> and click the confirmation link to activate your account and join your team.</>
                : <>Welcome to VATwatchHQ. Please check your email at <strong>{email}</strong> and click the confirmation link to activate your account.</>}
            </p>
            {!isInvited && (
              <div className="rounded-xl bg-[#f2f7f8] border-l-4 border-[#c9af69] p-4 text-sm text-[#343b46] text-left mb-6">
                <p className="font-semibold mb-1">Your 30-day free trial starts now</p>
                <p className="text-slate-500">You have full access to all features for 30 days. No credit card required.</p>
              </div>
            )}
            <Link href="/dashboard" className="block w-full rounded-xl bg-[#343b46] px-4 py-3 text-sm font-semibold text-white hover:bg-[#2a303a] transition-colors text-center">
              Go to dashboard →
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f2f7f8] flex items-center justify-center p-6" style={{ fontFamily: "'Open Sans', sans-serif" }}>
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="rounded-3xl bg-[#343b46] p-8 text-white mb-6">
          <div className="flex items-center gap-1 mb-2">
            <span className="text-[#c9af69] font-bold text-lg">VAT</span>
            <span className="text-white font-bold text-lg">watchHQ</span>
          </div>
          {isInvited ? (
            <>
              <h1 className="text-3xl font-bold">You're invited</h1>
              <p className="mt-2 text-slate-300 text-sm">Set up your account to join your team on VATwatchHQ.</p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold">Get started</h1>
              <p className="mt-2 text-slate-300 text-sm">Monitor your clients' VAT registration threshold automatically.</p>
              <div className="mt-4 flex gap-4 text-xs text-slate-300 flex-wrap">
                <span>✓ 30-day free trial</span>
                <span>✓ No credit card required</span>
                <span>✓ Xero integration</span>
              </div>
            </>
          )}
        </div>

        {/* Form */}
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <h2 className="text-lg font-bold text-[#343b46] mb-6">Create your account</h2>

          {isInvited && (
            <div className="mb-5 rounded-xl bg-[#c9af69]/10 border border-[#c9af69]/30 p-3 text-sm text-[#343b46]">
              🎉 You've been invited to join an existing firm. Just set your name and password below to accept.
            </div>
          )}

          {!isInvited && (
            <div className="mb-4">
              <label className="block text-sm font-semibold text-[#343b46] mb-1">
                Firm name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none"
                placeholder="e.g. Smith & Co. Accountants"
                value={firmName}
                onChange={(e) => setFirmName(e.target.value)}
              />
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-semibold text-[#343b46] mb-1">
              Your full name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none"
              placeholder="e.g. John Smith"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-semibold text-[#343b46] mb-1">
              Email address <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
              placeholder="e.g. john@smithco.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isInvited}
            />
            {isInvited && <p className="text-xs text-slate-400 mt-1">This is the email address your invite was sent to.</p>}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-semibold text-[#343b46] mb-1">
              Password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none"
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-[#343b46] mb-1">
              Confirm password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none"
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <div className="mb-6 flex items-start gap-3">
            <input type="checkbox" id="terms" className="mt-1 rounded" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} />
            <label htmlFor="terms" className="text-sm text-slate-500">
              I agree to the <a href="/terms" target="_blank" className="text-[#343b46] font-semibold hover:text-[#c9af69]">terms of service</a> and <a href="/privacy" target="_blank" className="text-[#343b46] font-semibold hover:text-[#c9af69]">privacy policy</a>
            </label>
          </div>

          {error && (
            <div className="mb-4 rounded-xl bg-red-50 border-l-4 border-red-400 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            onClick={handleSignup}
            disabled={saving}
            className="w-full rounded-xl bg-[#343b46] px-4 py-3 font-semibold text-white hover:bg-[#2a303a] transition-colors disabled:opacity-50"
          >
            {saving ? "Creating account..." : isInvited ? "Accept invite →" : "Start free trial →"}
          </button>

          <p className="mt-4 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link href="/dashboard" className="font-semibold text-[#343b46] hover:text-[#c9af69]">
              Sign in
            </Link>
          </p>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Provided by Maddock & Co. UK Ltd · <a href="https://www.maddockandco.com" className="hover:text-[#343b46]">maddockandco.com</a>
        </p>
      </div>
    </main>
  );
}
