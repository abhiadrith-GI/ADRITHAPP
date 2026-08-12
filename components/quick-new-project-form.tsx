"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/types/database";
import { RingBackground } from "@/components/ring-background";
import { AddMemberForm } from "@/components/add-member-form";

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "contractor", label: "Contractor" },
  { value: "engineer", label: "Engineer" },
  { value: "architect", label: "Architect" },
  { value: "student", label: "Student" },
];

type AddedMember = { full_name: string; role_on_project: UserRole; is_project_designer: boolean };

/**
 * A simplified project-creation flow for tools other than Civil & RCC
 * Quality Control. It's still the same underlying project - stages get
 * seeded via finalize_project_setup exactly like Civil & RCC's own flow
 * does, so it's just as usable there later - just without the QC-specific
 * fields (starting stage, existing floor count, designer/sign-off
 * authority) that would be confusing noise for someone here to calculate
 * quantities or materials, not run a checklist. Those default to the
 * simplest case: 0 existing floors, starting at Layout, not marked as
 * designer - all of which can still be set properly later from within
 * Civil & RCC if this project ever gets used there too.
 */
export function QuickNewProjectForm({
  toolKey,
  backHref,
  backLabel,
  continueBasePath,
}: {
  toolKey: string;
  backHref: string;
  backLabel: string;
  continueBasePath: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<"details" | "team">("details");
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [addedMembers, setAddedMembers] = useState<AddedMember[]>([]);

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [roleOnProject, setRoleOnProject] = useState<UserRole>("contractor");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        requested_start_stage_key: null,
        requested_floor_count: 0,
        created_in_tool: toolKey,
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
      is_project_designer: false,
    });

    if (memberError) {
      setError(memberError.message);
      setLoading(false);
      return;
    }

    const { error: setupError } = await supabase.rpc("finalize_project_setup", {
      target_project_id: project.id,
    });

    if (setupError) {
      setError(setupError.message);
      setLoading(false);
      return;
    }

    setProjectName(name.trim());
    setCreatedProjectId(project.id);
    setLoading(false);
    setStep("team");
  }

  if (step === "team" && createdProjectId) {
    return (
      <main className="relative min-h-screen overflow-hidden px-4 py-8">
        <RingBackground cyPercent={7} bright={false} />
        <div className="relative z-10 mx-auto max-w-md">
          <p className="font-mono text-xs text-[var(--adrith-dim-2)]">{projectName} — created</p>
          <h1 className="mb-2 mt-3 text-lg font-bold">Add your team</h1>
          <p className="mb-6 text-sm text-[var(--adrith-dim-2)]">
            Add anyone else involved — contractor, owner, engineer, or
            student — before moving on. Only registered ADRITH accounts can
            be added; you can always add more later from the project page.
          </p>

          <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">
            {addedMembers.length + 1}/4 members
          </p>

          {addedMembers.length > 0 && (
            <div className="mb-6 flex flex-col gap-2">
              <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">
                Added so far
              </p>
              {addedMembers.map((m, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-white/15 bg-[var(--adrith-card)] px-3 py-2 text-sm"
                >
                  <span>{m.full_name}</span>
                  <span className="text-xs text-[var(--adrith-dim-2)]">{m.role_on_project}</span>
                </div>
              ))}
            </div>
          )}

          {addedMembers.length + 1 >= 4 ? (
            <p className="text-xs text-[var(--adrith-dim-2)]">
              This project has reached its 4-member limit.
            </p>
          ) : (
            <AddMemberForm
              projectId={createdProjectId}
              onAdded={(m) => setAddedMembers((prev) => [...prev, m])}
            />
          )}

          <button
            type="button"
            onClick={() => router.push(`${continueBasePath}/${createdProjectId}`)}
            className="mt-6 w-full rounded-lg bg-[var(--adrith-rust)] py-3 text-sm font-semibold text-black"
          >
            {addedMembers.length > 0 ? "Continue to project" : "Skip for now"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <RingBackground cyPercent={7} bright={false} />
      <div className="relative z-10 mx-auto max-w-md">
        <Link href={backHref} className="font-mono text-xs text-[var(--adrith-dim-2)]">
          ← {backLabel}
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

          <p className="text-xs text-[var(--adrith-dim-2)]">
            This is a real ADRITH project, same as one started from Civil
            &amp; RCC — if you or your team ever want to run that checklist
            on it too, it&apos;ll already be there, starting from Layout.
          </p>

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
