"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const supabase = createBrowserSupabaseClient();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  async function signInWithMagicLink() {
    setMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Check your email for the login link.");
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto mt-20 max-w-md rounded-3xl border bg-white p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Maddock & Co</p>
        <h1 className="mt-2 text-2xl font-bold">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">Enter your email to receive a secure login link.</p>

        <label className="mt-6 block text-sm font-medium">Email</label>
        <input
          type="email"
          className="mt-1 w-full rounded-xl border p-3"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="client@example.com"
        />

        <button onClick={signInWithMagicLink} className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
          Send magic link
        </button>

        {message ? <p className="mt-4 text-sm text-slate-600">{message}</p> : null}
      </div>
    </main>
  );
}
