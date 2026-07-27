"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Shown on a project's detail page while it's waiting for its requested
 * starting stage (something other than Foundation) to be confirmed. Until
 * that happens, no checklist_stages rows exist yet for this project — see
 * finalize_project_setup / approve_project_start_stage in schema.sql.
 */
export function PendingStartBanner({
  projectId,
  requestedStageName,
  canApprove,
}: {
  projectId: string;
  requestedStageName: string;
  canApprove: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setSubmitting(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc("approve_project_start_stage", {
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
    <div className="mb-6 rounded-xl border border-[var(--adrith-rust)]/50 bg-[var(--adrith-card)] p-4">
      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--adrith-rust)]">
        Awaiting Confirmation
      </p>
      <p className="mt-2 text-sm">
        This project was set up to start tracking from{" "}
        <strong>{requestedStageName}</strong>, skipping the stages before it.{" "}
        {canApprove
          ? "As this project's designer or a platform admin, you can confirm it below."
          : "It needs to be confirmed by this project's designer or a platform admin before the checklist starts."}
      </p>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {canApprove && (
        <button
          onClick={handleApprove}
          disabled={submitting}
          className="mt-3 rounded-lg bg-[var(--adrith-rust)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
        >
          {submitting ? "Confirming…" : `Confirm start at ${requestedStageName}`}
        </button>
      )}
    </div>
  );
}
