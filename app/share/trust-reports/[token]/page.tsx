import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { AdrithLogo } from "@/components/adrith-logo";

// Never let search engines index a page whose URL is itself the access secret.
export const metadata = { robots: { index: false, follow: false, nocache: true } };

export default async function SharedTrustReportsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_+-]{20,64}$/.test(token)) {
    notFound();
  }
  const supabase = await createClient();

  const { data: rows, error } = await supabase.rpc("get_shared_trust_reports", { share_token: token });

  if (error || !rows || rows.length === 0) {
    notFound();
  }

  const { project_name, project_location } = rows[0];

  return (
    <main className="relative min-h-screen overflow-hidden bg-black px-4 py-8 text-[var(--adrith-off-white,white)]">
      <div className="relative z-10 mx-auto max-w-md">
        <div className="mb-6 flex items-center gap-2">
          <AdrithLogo className="h-5 w-auto" />
          <span className="text-xs font-bold tracking-[0.2em]">ADRITH</span>
        </div>
        <h1 className="mb-1 text-lg font-bold">{project_name}</h1>
        {project_location && <p className="mb-6 text-xs text-white/60">{project_location}</p>}

        <p className="mb-4 font-mono text-[11px] uppercase tracking-wider text-white/50">Progress Reports</p>
        <div className="flex flex-col gap-4">
          {rows.map((r: { generated_at: string; report_text: string }, i: number) => (
            <div key={i} className="rounded-xl border border-white/15 bg-white/5 px-4 py-4">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[var(--adrith-rust,#b45526)]">
                {i === 0 ? "Latest — " : ""}
                {new Date(r.generated_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.report_text}</p>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-[10px] text-white/40">Shared via ADRITH</p>
      </div>
    </main>
  );
}
