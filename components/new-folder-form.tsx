"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function NewFolderForm() {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const { data, error: insertError } = await supabase
      .from("project_folders")
      .insert({ name: name.trim(), created_by: user.id })
      .select("id")
      .single();

    setLoading(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "Could not create the folder.");
      return;
    }

    router.push(`/dashboard/completed-projects/${data.id}`);
  }

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Folder name (usually a project name)"
        className="flex-1 rounded-lg border border-white/20 bg-[var(--adrith-card)] px-3 py-2.5 text-sm outline-none"
      />
      <button
        type="button"
        onClick={handleCreate}
        disabled={loading || !name.trim()}
        className="shrink-0 rounded-lg bg-[var(--adrith-rust)] px-3 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
      >
        {loading ? "…" : "+ New"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
