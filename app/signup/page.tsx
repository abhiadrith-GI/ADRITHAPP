"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/types/database";
import { RingBackground } from "@/components/ring-background";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "contractor", label: "Contractor" },
  { value: "engineer", label: "Engineer" },
  { value: "architect", label: "Architect" },
  { value: "student", label: "Student" },
];

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("contractor");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function isAtLeast18(isoDate: string): boolean {
    const dob = new Date(isoDate);
    if (isNaN(dob.getTime())) return false;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const hasHadBirthdayThisYear =
      today.getMonth() > dob.getMonth() ||
      (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
    if (!hasHadBirthdayThisYear) age--;
    return age >= 18;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (role === "student" && (!dateOfBirth || !isAtLeast18(dateOfBirth))) {
      setError("Student accounts are currently only available to those 18 or older.");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
          ...(role === "student" ? { date_of_birth: dateOfBirth } : {}),
        },
      },
    });

    if (signUpError) {
      setLoading(false);
      setError(signUpError.message);
      return;
    }

    router.push("/login?confirm=1");
  }

  return (
    <main className="relative flex min-h-screen flex-col justify-center overflow-hidden px-6 py-10">
      <RingBackground cyPercent={30} bright={false} />

      <div className="relative z-10 mx-auto w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold">Create your ADRITH account</h1>
        <p className="mb-6 text-sm text-neutral-500">
          Your role determines what you can sign off on later — choose the one
          that matches your actual work.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="fullName" className="mb-1 block text-sm font-medium">
              Full name
            </label>
            <input
              id="fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>

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
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium">Your role</span>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((r) => (
                <button
                  type="button"
                  key={r.value}
                  onClick={() => setRole(r.value)}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    role === r.value
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300 text-neutral-700"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {role === "student" && (
            <div>
              <label htmlFor="dateOfBirth" className="mb-1 block text-sm font-medium">
                Date of birth
              </label>
              <input
                id="dateOfBirth"
                type="date"
                required
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-neutral-500">
                Student accounts are currently only available to those 18 or older.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-neutral-500">
          Already have an account?{" "}
          <a href="/login" className="font-medium text-neutral-900 underline">
            Log in
          </a>
        </p>
      </div>
    </main>
  );
}
