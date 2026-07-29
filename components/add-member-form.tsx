"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/types/database";

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "contractor", label: "Contractor" },
  { value: "engineer", label: "Engineer" },
  { value: "architect", label: "Architect" },
  { value: "student", label: "Student" },
];

type FoundUser = {
  id: string;
  full_name: string;
  role: UserRole;
  license_verified: boolean;
};

/**
 * Only the project's creator can actually add members (enforced by RLS,
 * not just this form) — anyone else who opens this will just get a clear
 * error back from Supabase when they try, rather than this form pretending
 * the option isn't there at all.
 */
export function AddMemberForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [found, setFound] = useState<FoundUser | null | undefined>(undefined);
  const [roleOnProject, setRoleOnProject] = useState<UserRole>("contractor");
  const [makeDesigner, setMakeDesigner] = useState(false);
  const [looking, setLooking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canBeDesigner = roleOnProject === "engineer" || roleOnProject === "architect";

  async function handleLookup() {
    setError(null);
    setLooking(true);
    setFound(undefined);

    const { data, error: rpcError } = await supabase.rpc("find_user_by_email", {
      lookup_email: email.trim(),
    });

    setLooking(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    const match = Array.isArray(data) ? data[0] : data;
    if (!match) {
      setFound(null);
      return;
    }

    setFound(match as FoundUser);
    setRoleOnProject((match as FoundUser).role);
  }

  async function handleAdd() {
    if (!found) return;
    setAdding(true);
    setError(null);

    const { error: insertError } = await supabase.from("project_members").insert({
      project_id: projectId,
      user_id: found.id,
      role_on_project: roleOnProject,
      is_project_designer: canBeDesigner && makeDesigner,
    });

    if (insertError) {
      setError(insertError.message);
      setAdding(false);
      return;
    }

    setEmail("");
    setFound(undefined);
    setMakeDesigner(false);
    setAdding(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setFound(undefined);
          }}
          placeholder="Their ADRITH account email"
          className="flex-1 rounded-lg border border-white/20 bg-[var(--adrith-card)] px-3 py-2 text-sm outline-none"
        />
        <button
          type="button"
          onClick={handleLookup}
          disabled={looking || !email.trim()}
          className="rounded-lg border border-white/20 px-3 py-2 text-sm disabled:opacity-50"
        >
          {looking ? "…" : "Find"}
        </button>
      </div>

      {found === null && (
        <p className="text-xs text-[var(--adrith-dim-2)]">
          No ADRITH account found with that email — they need to sign up first.
        </p>
      )}

      {found && (
        <div className="rounded-lg border border-white/20 p-3">
          <p className="text-sm font-semibold">{found.full_name}</p>
          <p className="mb-2 text-xs text-[var(--adrith-dim-2)]">Account role: {found.role}</p>

          <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--adrith-dim)]">
            Role on this project
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {ROLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRoleOnProject(opt.value)}
                className={`rounded-lg border px-2 py-1.5 text-xs ${
                  roleOnProject === opt.value
                    ? "border-[var(--adrith-rust)] text-[var(--adrith-rust)]"
                    : "border-white/20"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {canBeDesigner && (
            <label className="mt-2 flex items-start gap-2 text-xs text-[var(--adrith-dim-2)]">
              <input
                type="checkbox"
                checked={makeDesigner}
                onChange={(e) => setMakeDesigner(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Make this project&apos;s designer
                {!found.license_verified &&
                  " — note: this account isn't license-verified yet, so this won't actually take effect until it is"}
              </span>
            </label>
          )}

          <button
            type="button"
            onClick={handleAdd}
            disabled={adding}
            className="mt-3 w-full rounded-lg bg-[var(--adrith-rust)] py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {adding ? "Adding…" : `Add ${found.full_name}`}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
