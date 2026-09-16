"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function FolderShareLink({ folderId, existingToken }: { folderId: string; existingToken: string | null }) {
  const supabase = createClient();
  const [token, setToken] = useState(existingToken);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createShareLink() {
    setSharing(true);
    setError(null);
    const { data, error: shareError } = await supabase
      .from("public_share_links")
      .insert({ resource_type: "completed_project_folder", resource_id: folderId })
      .select("token")
      .single();
    setSharing(false);
    if (shareError || !data) {
      setError(shareError?.message ?? "Could not create a share link.");
      return;
    }
    setToken(data.token);
  }

  function copyLink() {
    if (!token) return;
    const url = `${window.location.origin}/share/completed-project/${token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mb-6 rounded-xl border border-white/15 bg-black/20 px-4 py-3">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">Share with client</p>
      {token ? (
        <button
          type="button"
          onClick={copyLink}
          className="w-full rounded-lg border border-white/20 bg-[var(--adrith-card)] px-3 py-2 text-left text-xs text-[var(--adrith-dim-2)]"
        >
          {copied ? "Copied!" : `.../share/completed-project/${token.slice(0, 10)}… (tap to copy)`}
        </button>
      ) : (
        <button
          type="button"
          disabled={sharing}
          onClick={createShareLink}
          className="rounded-lg border border-white/20 px-3 py-2 text-xs text-[var(--adrith-off-white)] disabled:opacity-50"
        >
          {sharing ? "Creating…" : "Create Share Link"}
        </button>
      )}
      {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
      <p className="mt-2 text-[10px] text-[var(--adrith-dim-2)]">
        Anyone with this link can view these files — no account needed. Only share it with people you trust.
      </p>
    </div>
  );
}
