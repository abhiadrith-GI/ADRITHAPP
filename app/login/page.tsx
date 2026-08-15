"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageBackground } from "@/components/page-background";
import { AdrithLogo } from "@/components/adrith-logo";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justSignedUp = searchParams.get("confirm") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setLoading(false);
      setError(signInError.message);
      return;
    }

    // Deliberately NOT resetting loading back to false here - the button
    // staying in "Logging in…" through the redirect is what it should look
    // like, since the page is navigating away regardless. Turning it back
    // to a clickable "Log in" state right as navigation starts is exactly
    // what made this feel like it needed a second click before.
    router.push("/dashboard");
  }

  return (
    <main className="relative flex min-h-screen flex-col justify-center overflow-hidden px-6">
      <PageBackground src="/backgrounds/login-landing.jpg" />

      <div className="relative z-10 mx-auto w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <AdrithLogo className="h-6 w-auto" />
          <span className="text-sm font-bold tracking-[0.2em]">ADRITH</span>
        </div>
        <h1 className="mb-1 text-xl font-semibold">Log in to ADRITH</h1>

        {justSignedUp && (
          <p className="mb-6 rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-700">
            Account created. Check your email to confirm it, then log in below.
          </p>
        )}

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

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-neutral-500">
          Don&apos;t have an account?{" "}
          <a href="/signup" className="font-medium text-neutral-900 underline">
            Sign up
          </a>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
