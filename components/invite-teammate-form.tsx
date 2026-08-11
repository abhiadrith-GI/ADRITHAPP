"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Unlike AddMemberForm (which requires the person to already have an
 * ADRITH account, looked up by find_user_by_email), a firm invite is
 * exactly how someone WITHOUT an account yet gets onto the platform at
 * all - so this doesn't look anyone up, it just creates the invite row
 * and hands back a link. RLS (see supabase/patch-firms-multitenancy.sql)
 * is what actually stops a non-admin from creating one; this form just
 * assumes it's being shown to an admin, matching how AddMemberForm
 * already assumes it's shown to a project creator.
 */
export function InviteTeammateForm({ firmId }: { firmId: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSend() {
    if (!email.trim()) return;
    setSending(true);
    setError(null);
    setInviteLink(null);

    const { data, error: insertError } = await supabase
      .from("firm_invites")
      .insert({ firm_id: firmId, invited_email: email.trim().toLowerCase() })
      .select("id")
      .single();

    setSending(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    const link = `${window.location.origin}/signup?invite=${data.id}`;
    setInviteLink(link);
    setEmail("");
    router.refresh();
  }

  async function handleCopy() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setInviteLink(null);
          }}
          placeholder="Teammate's email"
          className="flex-1 rounded-lg border border-white/20 bg-[var(--adrith-card)] px-3 py-2 text-sm outline-none"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !email.trim()}
          className="rounded-lg bg-[var(--adrith-rust)] px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
        >
          {sending ? "…" : "Invite"}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {inviteLink && (
        <div className="rounded-lg border border-white/20 p-3">
          <p className="mb-2 text-xs text-[var(--adrith-dim-2)]">
            Send this link to them directly — it only works for the email
            you just entered.
          </p>
          <div className="flex gap-2">
            <code className="flex-1 truncate rounded-md bg-black/40 px-2 py-1.5 text-xs">
              {inviteLink}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded-md border border-white/20 px-2 py-1.5 text-xs"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
