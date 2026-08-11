"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Shown to an account that exists but isn't linked to a firm yet - either
 * a fresh signup that skipped the choice, or an invite that didn't match
 * at signup time (wrong email, expired link). Both paths call the same
 * RPCs handle_new_user() itself uses, just triggered post-signup instead
 * of during it - see create_firm_for_self / accept_firm_invite_for_self
 * in supabase/patch-firms-multitenancy.sql.
 */
export function NoFirmRecovery() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"create" | "join" | null>(null);
  const [firmName, setFirmName] = useState("");
  const [inviteInput, setInviteInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function extractInviteId(input: string): string {
    // Accepts either a full invite link or a bare invite id.
    const trimmed = input.trim();
    const match = trimmed.match(/invite=([0-9a-fA-F-]{36})/);
    return match ? match[1] : trimmed;
  }

  async function handleCreate() {
    if (!firmName.trim()) return;
    setLoading(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("create_firm_for_self", {
      new_firm_name: firmName.trim(),
    });
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  async function handleJoin() {
    if (!inviteInput.trim()) return;
    setLoading(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("accept_firm_invite_for_self", {
      target_invite_id: extractInviteId(inviteInput),
    });
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-2xl border-[2.2px] border-white/20 bg-[var(--adrith-card)] p-4">
      <p className="mb-1 text-sm font-semibold">You&apos;re not part of a firm yet</p>
      <p className="mb-4 text-xs text-[var(--adrith-dim-2)]">
        You&apos;ll need to create a firm or join one before you can start a
        project.
      </p>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("create")}
          className={`rounded-lg border px-3 py-2 text-sm ${
            mode === "create" ? "border-[var(--adrith-rust)] text-[var(--adrith-rust)]" : "border-white/20"
          }`}
        >
          Start a firm
        </button>
        <button
          type="button"
          onClick={() => setMode("join")}
          className={`rounded-lg border px-3 py-2 text-sm ${
            mode === "join" ? "border-[var(--adrith-rust)] text-[var(--adrith-rust)]" : "border-white/20"
          }`}
        >
          I have an invite
        </button>
      </div>

      {mode === "create" && (
        <div className="flex gap-2">
          <input
            type="text"
            value={firmName}
            onChange={(e) => setFirmName(e.target.value)}
            placeholder="Firm name"
            className="flex-1 rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={loading || !firmName.trim()}
            className="rounded-lg bg-[var(--adrith-rust)] px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {loading ? "…" : "Create"}
          </button>
        </div>
      )}

      {mode === "join" && (
        <div className="flex gap-2">
          <input
            type="text"
            value={inviteInput}
            onChange={(e) => setInviteInput(e.target.value)}
            placeholder="Paste your invite link"
            className="flex-1 rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            onClick={handleJoin}
            disabled={loading || !inviteInput.trim()}
            className="rounded-lg bg-[var(--adrith-rust)] px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {loading ? "…" : "Join"}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
