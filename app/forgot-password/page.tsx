"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageBackground } from "@/components/page-background";
import { AdrithLogo } from "@/components/adrith-logo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  return (
    <main className="relative flex min-h-screen flex-col justify-center overflow-hidden px-6">
      <PageBackground src="/backgrounds/login-landing.jpg" />

      <div className="relative z-10 mx-auto w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <AdrithLogo className="h-6 w-auto" />
          <span className="text-sm font-bold tracking-[0.2em]">ADRITH</span>
        </div>
        <h1 className="mb-1 text-xl font-semibold">Reset your password</h1>

        {sent ? (
          <p className="mt-4 rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-700">
            If an account exists for that email, a reset link is on its way — check your inbox (and spam folder), then
            follow the link to set a new password.
          </p>
        ) : (
          <>
            <p className="mb-6 text-sm text-neutral-500">Enter your email and we&apos;ll send you a link to reset it.</p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-medium">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          </>
        )}

        <p className="mt-6 text-center text-sm text-neutral-500">
          <a href="/login" className="font-medium text-neutral-900 underline">
            Back to log in
          </a>
        </p>
      </div>
    </main>
  );
}
