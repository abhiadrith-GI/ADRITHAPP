"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Only rendered for the project's actual creator (checked server-side,
 * this component just assumes that's already true). Deliberately no admin
 * override, matching the explicit decision that this authority stays
 * narrower than everything else in the app.
 */
export function DeleteProjectButton({
  projectId,
  projectName,
  hasAnySignOff,
  redirectTo,
}: {
  projectId: string;
  projectName: string;
  hasAnySignOff: boolean;
  redirectTo: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (hasAnySignOff) {
    return (
      <p className="mt-10 text-[11px] text-[var(--adrith-dim-2)]">
        This project can no longer be deleted — at least one stage has
        already been signed off, and once work is confirmed, the record is
        permanent.
      </p>
    );
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc("delete_project", {
      target_project_id: projectId,
    });

    if (rpcError) {
      setError(rpcError.message);
      setDeleting(false);
      return;
    }

    router.push(redirectTo);
  }

  if (!confirming) {
    return (
      <div className="mt-10 border-t border-white/10 pt-6">
        <button
          onClick={() => setConfirming(true)}
          className="text-xs text-red-400 underline"
        >
          Delete this project
        </button>
      </div>
    );
  }

  return (
    <div className="mt-10 border-t border-white/10 pt-6">
      <p className="text-sm">
        Delete <strong>{projectName}</strong> and everything on it — every
        stage, checkpoint, and photo? This cannot be undone.
      </p>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {deleting ? "Deleting…" : "Yes, delete it"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="rounded-lg border border-white/25 px-4 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
