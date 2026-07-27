"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_STAGES, type UserRole } from "@/types/database";
import { RingBackground } from "@/components/ring-background";

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
  const [startStageKey, setStartStageKey] = useState<string>(DEFAULT_STAGES[0].key);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canBeDesigner = roleOnProject === "engineer" || roleOnProject === "architect";
  const willBeDesigner = canBeDesigner && isDesigner;
  const startsAtFoundation = startStageKey === DEFAULT_STAGES[0].key;

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

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        name: name.trim(),
        location: location.trim() || null,
        created_by: user.id,
        requested_start_stage_key: startsAtFoundation ? null : startStageKey,
      })
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
      is_project_designer: willBeDesigner,
    });

    if (memberError) {
      setError(memberError.message);
      setLoading(false);
      return;
    }

    // Stages are seeded here, not by a trigger on the projects insert above —
    // whether a non-Foundation start applies immediately or needs the
    // designer/admin to confirm it depends on is_project_designer, which
    // only exists as of the project_members insert just above this line.
    const { error: setupError } = await supabase.rpc("finalize_project_setup", {
      target_project_id: project.id,
    });

    if (setupError) {
      setError(setupError.message);
      setLoading(false);
      return;
    }

    router.push(`/dashboard/civil-rcc/${project.id}`);
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <RingBackground cyPercent={7} bright={false} />

      <div className="relative z-10 mx-auto max-w-md">
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

          <Field label="Starting stage">
            <div className="flex flex-col gap-2">
              {DEFAULT_STAGES.map((stage) => (
                <button
                  key={stage.key}
                  type="button"
                  onClick={() => setStartStageKey(stage.key)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${
                    startStageKey === stage.key
                      ? "border-[var(--adrith-rust)] text-[var(--adrith-rust)]"
                      : "border-white/20 text-[var(--adrith-off-white)]"
                  }`}
                >
                  {stage.name}
                </button>
              ))}
            </div>
            {!startsAtFoundation && (
              <p className="mt-1.5 text-xs text-[var(--adrith-dim-2)]">
                {willBeDesigner
                  ? "Stages before this one will show as not tracked. Since you're this project's designer, it applies right away."
                  : "Stages before this one will show as not tracked. Since you're not this project's designer, it'll need to be confirmed by the designer or a platform admin before the checklist starts."}
              </p>
            )}
          </Field>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg bg-[var(--adrith-rust)] px-4 py-3 text-sm font-semibold text-black disabled:opacity-60"
          >
            {loading ? "Creating…" : "Create Project"}
          </button>
        </form>
      </div>
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
