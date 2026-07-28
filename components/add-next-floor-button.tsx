"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AddNextFloorButton({
  projectId,
  nextFloorLabel,
  canAdd,
  readyToAdd,
}: {
  projectId: string;
  nextFloorLabel: string;
  /** Whether this viewer is this project's designer or a platform admin. */
  canAdd: boolean;
  /** Whether the current top floor's Slab & Beam has actually been signed off. */
  readyToAdd: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canAdd) return null;

  async function handleAdd() {
    setSubmitting(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc("add_next_floor", {
      target_project_id: projectId,
    });

    if (rpcError) {
      setError(rpcError.message);
      setSubmitting(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="mb-6">
      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
      <button
        onClick={handleAdd}
        disabled={submitting || !readyToAdd}
        title={readyToAdd ? "" : "The current top floor's Slab & Beam must be signed off first"}
        className="w-full rounded-lg border border-dashed border-white/25 py-2.5 text-center font-mono text-xs text-[var(--adrith-dim-2)] disabled:opacity-50"
      >
        {submitting ? "Adding…" : `+ Add ${nextFloorLabel}`}
      </button>
      {!readyToAdd && (
        <p className="mt-1.5 text-center text-[11px] text-[var(--adrith-dim-2)]">
          Available once the current top floor&apos;s Slab &amp; Beam is signed off
        </p>
      )}
    </div>
  );
}
