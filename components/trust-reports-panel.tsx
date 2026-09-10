"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Report = {
  id: string;
  report_text: string | null;
  status: string;
  created_at: string;
};

export function TrustReportsPanel({ projectId, reports }: { projectId: string; reports: Report[] }) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
