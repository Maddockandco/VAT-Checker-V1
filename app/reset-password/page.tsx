// app/reset-password/page.tsx
// Password reset page — handles both the request and the actual reset

"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export default function ResetPasswordPage() {
  const [mode, setMode] = useState<"request" | "reset" | "done">("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    // If URL has access_token, we're in reset mode (came from email link)
    if (window.location.hash.includes("access_token") ||
        window.location.hash.includes("type=recovery")) {
      setMode("reset");
    }
  }, []);

  async function handleRequest() {
    if (!email.trim()) { setError("Please enter your email address."); return; }
    if (!supabase) { setError("Connection error. Please refresh and try again."); return; }
    setLoading(true); setError("");
    try {
      const result = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      console.log("DEBUG resetPasswordForEmail result:", JSON.stringify(result));
      const err = result.error;
      if (err) {
        const debugInfo = `[DEBUG] name=${(err as any)?.name} status=${(err as any)?.status} message=${(err as any)?.message} raw=${JSON.stringify(err)}`;
        setError(debugInfo);
      } else {
        setMessage("Check your email for a password reset link.");
        setMode("done");
      }
    } catch (unexpectedError) {
      setError(`[DEBUG catch] ${JSON.stringify(unexpectedError, Object.getOwnPropertyNames(unexpectedError as object))}`);
    }
    setLoading(false);
  }

  async function handleReset() {
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    if (!supabase) { setError("Connection error. Please refresh and try again."); return; }
    setLoading(true); setError("");
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) {
        setError(typeof err.message === "string" && err.message ? err.message : "Could not update your password. Please try again.");
      } else {
        setMessage("Password updated successfully!");
        setMode("done");
      }
    } catch (unexpectedError) {
      setError(unexpectedError instanceof Error ? unexpectedError.message : "Something went wrong. Please try again.");
    }
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-[#f2f7f8] flex items-center justify-center p-6" style={{ fontFamily: "'Open Sans', sans-serif" }}>
      <div className="w-full max-w-md">
        <div className="mb-6 rounded-3xl bg-[#343b46] p-8 text-white">
          <div className="flex items-center gap-1 mb-2">
            <span className="text-[#c9af69] font-bold text-lg">VAT</span>
            <span className="text-white font-bold text-lg">watchHQ</span>
          </div>
          <p className="mt-2 text-slate-300 text-sm">
            {mode === "request" ? "Reset your password" : mode === "reset" ? "Choose a new password" : "All done!"}
          </p>
        </div>

        <div className="rounded-3xl bg-white p-8 shadow-sm">
          {mode === "done" ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">✅</span>
              </div>
              <p className="text-[#343b46] font-semibold mb-2">{message}</p>
              <Link href="/dashboard" className="block mt-4 w-full rounded-xl bg-[#343b46] px-4 py-3 text-sm font-semibold text-white text-center hover:bg-[#2a303a] transition-colors">
                Go to dashboard →
              </Link>
            </div>
          ) : mode === "request" ? (
            <>
              <p className="text-sm text-slate-500 mb-6">Enter your email address and we'll send you a link to reset your password.</p>
              <label className="block text-sm font-semibold text-[#343b46] mb-1">Email address</label>
              <input type="email" className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none mb-4" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" />
              {error && <p className="mb-4 rounded-xl bg-red-50 border-l-4 border-red-400 p-3 text-sm text-red-700">{error}</p>}
              <button onClick={handleRequest} disabled={loading} className="w-full rounded-xl bg-[#343b46] px-4 py-3 font-semibold text-white hover:bg-[#2a303a] transition-colors disabled:opacity-50">
                {loading ? "Sending..." : "Send reset link →"}
              </button>
              <p className="mt-4 text-center text-sm text-slate-500">
                Remember your password? <Link href="/dashboard" className="font-semibold text-[#343b46] hover:text-[#c9af69]">Sign in</Link>
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-500 mb-6">Choose a new password for your account.</p>
              <label className="block text-sm font-semibold text-[#343b46] mb-1">New password</label>
              <input type="password" className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none mb-4" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 8 characters" />
              <label className="block text-sm font-semibold text-[#343b46] mb-1">Confirm new password</label>
              <input type="password" className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#c9af69] focus:outline-none mb-4" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat your password" />
              {error && <p className="mb-4 rounded-xl bg-red-50 border-l-4 border-red-400 p-3 text-sm text-red-700">{error}</p>}
              <button onClick={handleReset} disabled={loading} className="w-full rounded-xl bg-[#343b46] px-4 py-3 font-semibold text-white hover:bg-[#2a303a] transition-colors disabled:opacity-50">
                {loading ? "Updating..." : "Update password →"}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
