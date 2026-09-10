import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PageBackground } from "@/components/page-background";
import { AdrithLogo } from "@/components/adrith-logo";
import { TrustReportsPanel } from "@/components/trust-reports-panel";

export default async function ProjectTrustReportsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase.from("projects").select("id, name, location").eq("id", projectId).single();
  if (!project) notFound();

  const { data: reports } = await supabase
    .from("trust_reports")
    .select("id, report_text, status, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <PageBackground src="/backgrounds/civil-rcc.jpg" />
      <div className="relative z-10 mx-auto max-w-md">
        <div className="mb-5 flex items-center gap-2">
          <AdrithLogo className="h-5 w-auto" />
          <span className="text-xs font-bold tracking-[0.2em]">ADRITH</span>
        </div>
        <Link href="/dashboard/trust-reports" className="font-mono text-xs text-[var(--adrith-dim-2)]">
          ← Trust Reports
        </Link>
        <h1 className="mb-1 mt-3 text-lg font-bold">{project.name}</h1>
        {project.location && <p className="mb-5 text-xs text-[var(--adrith-dim-2)]">{project.location}</p>}

        <TrustReportsPanel projectId={projectId} reports={reports ?? []} />
      </div>
    </main>
  );
}
