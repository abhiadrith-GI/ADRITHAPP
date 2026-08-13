"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface FileRow {
  id: string;
  file_name: string;
  storage_path: string;
  file_type: "pdf" | "image";
}

export function FolderFileSection({
  folderId,
  category,
  title,
  accept,
  files,
}: {
  folderId: string;
  category: "drawing" | "site_photo";
  title: string;
  accept: string;
  files: FileRow[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    for (const file of Array.from(fileList)) {
      const fileType: "pdf" | "image" = file.type === "application/pdf" ? "pdf" : "image";
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const path = `${folderId}/${category}/${crypto.randomUUID()}-${safeName}`;

      const { error: uploadError } = await supabase.storage.from("project-folder-files").upload(path, file);
      if (uploadError) {
        setError(uploadError.message);
        continue;
      }

      const { error: insertError } = await supabase.from("project_folder_files").insert({
        folder_id: folderId,
        uploaded_by: user.id,
        category,
        file_name: file.name,
        storage_path: path,
        file_type: fileType,
      });
      if (insertError) setError(insertError.message);
    }

    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  async function handleDelete(fileId: string, storagePath: string) {
    await supabase.storage.from("project-folder-files").remove([storagePath]);
    await supabase.from("project_folder_files").delete().eq("id", fileId);
    router.refresh();
  }

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">
          {title} ({files.length})
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-rust)] disabled:opacity-60"
        >
          {uploading ? "Uploading…" : "+ Add"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

      {files.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/15 px-3 py-4 text-center text-xs text-[var(--adrith-dim-2)]">
          Nothing here yet.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {files.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between rounded-lg border border-white/15 bg-[var(--adrith-card)] px-3 py-2"
            >
              <span className="truncate text-xs">{f.file_name}</span>
              <button
                type="button"
                onClick={() => handleDelete(f.id, f.storage_path)}
                className="ml-2 shrink-0 text-xs text-red-400"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
