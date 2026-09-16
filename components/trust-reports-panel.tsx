"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Report = {
  id: string;
  report_text: string | null;
  status: string;
  created_at: string;
};

export function TrustReportsPanel({ projectId, reports, existingShareToken }: { projectId: string; reports: Report[]; existingShareToken: string | null }) {
  const supabase = createClient();
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState(existingShareToken);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  async function createShareLink() {
    setSharing(true);
    setError(null);
    const { data, error: shareError } = await supabase
      .from("public_share_links")
      .insert({ resource_type: "trust_reports", resource_id: projectId })
      .select("token")
      .single();
    setSharing(false);
    if (shareError || !data) {
      setError(shareError?.message ?? "Could not create a share link.");
      return;
    }
    setShareToken(data.token);
  }

  function copyLink() {
    if (!shareToken) return;
    const url = `${window.location.origin}/share/trust-reports/${shareToken}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/trust-reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not generate a report.");
        setGenerating(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong generating the report.");
    }
    setGenerating(false);
  }

  const doneReports = reports.filter((r) => r.status === "done" && r.report_text);

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        disabled={generating}
        onClick={generate}
        className="rounded-xl bg-[var(--adrith-rust)] px-4 py-3 text-center text-sm font-semibold text-black disabled:opacity-50"
      >
        {generating ? "Generating…" : "Generate New Report"}
      </button>

      <div className="rounded-xl border border-white/15 bg-black/20 px-4 py-3">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">
          Share with family outside the app
        </p>
        {shareToken ? (
          <button
            type="button"
            onClick={copyLink}
            className="w-full rounded-lg border border-white/20 bg-[var(--adrith-card)] px-3 py-2 text-left text-xs text-[var(--adrith-dim-2)]"
          >
            {copied ? "Copied!" : `.../share/trust-reports/${shareToken.slice(0, 10)}… (tap to copy)`}
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
        <p className="mt-2 text-[10px] text-[var(--adrith-dim-2)]">
          Anyone with this link can view reports for this project — no account needed. Only share it with people you trust.
        </p>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {doneReports.length > 0 ? (
        <div className="flex flex-col gap-4">
          {doneReports.map((r, i) => (
            <div key={r.id} className="rounded-xl border border-white/15 bg-[var(--adrith-card)] px-4 py-4">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[var(--adrith-rust)]">
                {i === 0 ? "Latest — " : ""}
                {new Date(r.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.report_text}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-[var(--adrith-dim-2)]">
          No reports yet — generate the first one above.
        </p>
      )}
    </div>
  );
}
