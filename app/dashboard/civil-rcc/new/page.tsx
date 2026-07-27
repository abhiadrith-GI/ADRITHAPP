"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/types/database";

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "contractor", label: "Contractor" },
  { value: "engineer", label: "Engineer" },
  { value: "architect", label: "Architect" },
];

export default function NewProjectPage() {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [roleOnProject, setRoleOnProject] = useState<UserRole>("engineer");
  const [isDesigner, setIsDesigner] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canBeDesigner = roleOnProject === "engineer" || roleOnProject === "architect";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Give the project a name.");
      return;
    }

    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    // Six stages and their real checkpoints are seeded automatically by the
    // on_project_created trigger — nothing further needed here for that part.
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({ name: name.trim(), location: location.trim() || null, created_by: user.id })
      .select("id")
      .single();

    if (projectError || !project) {
      setError(projectError?.message ?? "Could not create the project.");
      setLoading(false);
      return;
    }

    const { error: memberError } = await supabase.from("project_members").insert({
      project_id: project.id,
      user_id: user.id,
      role_on_project: roleOnProject,
      is_project_designer: canBeDesigner && isDesigner,
    });

    if (memberError) {
      setError(memberError.message);
      setLoading(false);
      return;
    }

    router.push(`/dashboard/civil-rcc/${project.id}`);
  }

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <Link href="/dashboard/civil-rcc" className="font-mono text-xs text-[var(--adrith-dim-2)]">
        ← Civil &amp; RCC
      </Link>

      <h1 className="mb-6 mt-3 text-lg font-bold">New Project</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Project name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Whitefield Residence"
            className="w-full rounded-lg border border-white/20 bg-[var(--adrith-card)] px-3 py-2.5 text-sm outline-none"
          />
        </Field>

        <Field label="Location">
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Bengaluru, Karnataka"
            className="w-full rounded-lg border border-white/20 bg-[var(--adrith-card)] px-3 py-2.5 text-sm outline-none"
          />
        </Field>

        <Field label="Your role on this project">
          <div className="grid grid-cols-2 gap-2">
            {ROLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRoleOnProject(opt.value)}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  roleOnProject === opt.value
                    ? "border-[var(--adrith-rust)] text-[var(--adrith-rust)]"
                    : "border-white/20 text-[var(--adrith-off-white)]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>

        {canBeDesigner && (
          <label className="flex items-start gap-2 text-xs text-[var(--adrith-dim-2)]">
            <input
              type="checkbox"
              checked={isDesigner}
              onChange={(e) => setIsDesigner(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I&apos;m the design lead on this project — I&apos;ll hold sign-off
              authority and admin the project&apos;s group.
            </span>
          </label>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-lg bg-[var(--adrith-rust)] px-4 py-3 text-sm font-semibold text-black disabled:opacity-60"
        >
          {loading ? "Creating…" : "Create Project"}
        </button>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">
        {label}
      </span>
      {children}
    </label>
  );
}
