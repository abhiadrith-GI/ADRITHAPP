import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { RingBackground } from "@/components/ring-background";
import { FolderFileSection } from "@/components/folder-file-section";

export default async function FolderDetailPage({ params }: { params: Promise<{ folderId: string }> }) {
  const { folderId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: folder } = await supabase.from("project_folders").select("id, name").eq("id", folderId).single();
  if (!folder) notFound();

  const { data: files } = await supabase
    .from("project_folder_files")
    .select("id, file_name, storage_path, file_type, category")
    .eq("folder_id", folderId)
    .order("created_at", { ascending: false });

  const drawings = (files ?? []).filter((f) => f.category === "drawing");
  const sitePhotos = (files ?? []).filter((f) => f.category === "site_photo");

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <RingBackground cyPercent={7} bright={false} />
      <div className="relative z-10 mx-auto max-w-md">
        <Link href="/dashboard/completed-projects" className="font-mono text-xs text-[var(--adrith-dim-2)]">
          ← Completed Projects
        </Link>
        <h1 className="mb-6 mt-3 text-lg font-bold">{folder.name}</h1>

        <FolderFileSection
          folderId={folder.id}
          category="drawing"
          title="Drawings"
          accept=".pdf,image/*"
          files={drawings}
        />

        <FolderFileSection
          folderId={folder.id}
          category="site_photo"
          title="Site Photos"
          accept="image/*"
          files={sitePhotos}
        />
      </div>
    </main>
  );
}
