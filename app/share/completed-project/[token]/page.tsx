"use client";

import { use, useEffect, useState } from "react";
import { AdrithLogo } from "@/components/adrith-logo";

type SharedFile = { id: string; fileName: string; category: string; fileType: string; url: string | null };

export default function SharedCompletedProjectPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/share/completed-project/${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "This link is invalid or has been revoked.");
          return;
        }
        setFolderName(data.folderName);
        setFiles(data.files);
      })
      .catch(() => setError("Something went wrong loading this link."))
      .finally(() => setLoading(false));
  }, [token]);

  const drawings = files.filter((f) => f.category === "drawing");
  const sitePhotos = files.filter((f) => f.category === "site_photo");

  return (
    <main className="relative min-h-screen overflow-hidden bg-black px-4 py-8 text-white">
      <div className="relative z-10 mx-auto max-w-md">
        <div className="mb-6 flex items-center gap-2">
          <AdrithLogo className="h-5 w-auto" />
          <span className="text-xs font-bold tracking-[0.2em]">ADRITH</span>
        </div>

        {loading && <p className="text-sm text-white/60">Loading…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}

        {folderName && (
          <>
            <h1 className="mb-6 text-lg font-bold">{folderName}</h1>

            {drawings.length > 0 && (
              <div className="mb-6">
                <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-white/50">Drawings</p>
                <div className="flex flex-col gap-1.5">
                  {drawings.map((f) => (
                    <a
                      key={f.id}
                      href={f.url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm"
                    >
                      {f.fileName}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {sitePhotos.length > 0 && (
              <div>
                <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-white/50">Site Photos</p>
                <div className="grid grid-cols-2 gap-2">
                  {sitePhotos.map((f) =>
                    f.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={f.id} src={f.url} alt={f.fileName} className="aspect-square w-full rounded-lg object-cover" />
                    ) : null
                  )}
                </div>
              </div>
            )}
          </>
        )}

        <p className="mt-8 text-center text-[10px] text-white/40">Shared via ADRITH</p>
      </div>
    </main>
  );
}
