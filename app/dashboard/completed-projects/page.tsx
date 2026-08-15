import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageBackground } from "@/components/page-background";
import { AdrithLogo } from "@/components/adrith-logo";
import { NewFolderForm } from "@/components/new-folder-form";

export default async function CompletedProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("firm_id").eq("id", user.id).single();

  const { data: folders } = profile?.firm_id
    ? await supabase
        .from("project_folders")
        .select("id, name, created_at")
        .order("created_at", { ascending: false })
    : { data: null };

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <PageBackground src="/backgrounds/completed-projects.jpg" />
      <div className="relative z-10 mx-auto max-w-md">
        <div className="mb-5 flex items-center gap-2">
          <AdrithLogo className="h-5 w-auto" />
          <span className="text-xs font-bold tracking-[0.2em]">ADRITH</span>
        </div>
        <Link href="/dashboard" className="font-mono text-xs text-[var(--adrith-dim-2)]">
          ← Dashboard
        </Link>
        <h1 className="mb-1 mt-3 text-lg font-bold">Completed Projects</h1>
        <p className="mb-6 text-sm text-[var(--adrith-dim-2)]">
          Drawings and site photos, organized by project — visible to your firm only.
        </p>

        {!profile?.firm_id ? (
          <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-[var(--adrith-dim-2)]">
            You need to be part of a firm to use this.{" "}
            <Link href="/dashboard/firm" className="text-[var(--adrith-rust)]">
              Set that up first →
            </Link>
          </p>
        ) : (
          <>
            <NewFolderForm />

            <div className="mt-6 flex flex-col gap-2">
              {folders && folders.length > 0 ? (
                folders.map((f) => (
                  <Link
                    key={f.id}
                    href={`/dashboard/completed-projects/${f.id}`}
                    className="block rounded-xl border border-white/20 bg-[var(--adrith-card)] px-4 py-3"
                  >
                    <p className="text-sm font-semibold">{f.name}</p>
                  </Link>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-[var(--adrith-dim-2)]">
                  No folders yet — start one above.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
