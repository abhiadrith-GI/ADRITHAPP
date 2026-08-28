"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Booking = {
  id: string;
  category: string;
  details: Record<string, string>;
  description: string;
  status: string;
  admin_note: string | null;
};

type Deliverable = {
  id: string;
  storage_path: string;
  file_name: string;
  uploaded_at: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  concept_plan: "Concept Plan",
  three_d_designs: "3D Designs",
  civil_execution_drawings: "Civil Execution Drawings",
  finishing_execution_drawings: "Finishing Execution Drawings",
};

const STATUS_LABELS: Record<string, string> = {
  booked: "Booked — we'll be in touch",
  in_progress: "In progress",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const DETAIL_LABELS: Record<string, string> = {
  plot_width: "Plot width (ft)",
  plot_depth: "Plot depth (ft)",
  road_facing: "Road-facing direction",
  floors: "Number of floors",
  bhk: "BHK requirement",
  vastu_required: "Vastu compliance needed",
  has_plan: "Existing floor plan",
  style_preference: "Style preference",
  views_needed: "Views needed",
  has_reference_plan: "Reference concept plan",
  reference_design: "Reference design",
};

export function BookingDetail({
  booking,
  deliverables,
  isAdmin,
}: {
  booking: Booking;
  deliverables: Deliverable[];
  isAdmin: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function refresh() {
    router.refresh();
  }

  async function setStatus(status: string) {
    setBusy(true);
    setError(null);
    const patch: Record<string, unknown> = { status };
    if (status === "delivered") patch.delivered_at = new Date().toISOString();
    const { error: e } = await supabase.from("design_studio_bookings").update(patch).eq("id", booking.id);
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    refresh();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${booking.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("design-studio-files").upload(path, file, { contentType: file.type });
    if (uploadError) {
      setUploading(false);
      setError(uploadError.message);
      return;
    }
    const { error: insertError } = await supabase
      .from("design_studio_deliverables")
      .insert({ booking_id: booking.id, storage_path: path, file_name: file.name });
    setUploading(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    e.target.value = "";
    refresh();
  }

  async function downloadFile(storagePath: string, fileName: string) {
    setError(null);
    const { data, error: signError } = await supabase.storage.from("design-studio-files").createSignedUrl(storagePath, 300);
    if (signError || !data) {
      setError(signError?.message ?? "Could not open that file.");
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = fileName;
    a.target = "_blank";
    a.click();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-[var(--adrith-rust)] bg-[var(--adrith-card)] px-4 py-3">
        <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-rust)]">Status</p>
        <p className="mt-0.5 text-sm font-semibold">{STATUS_LABELS[booking.status] ?? booking.status}</p>
      </div>

      <div className="rounded-xl border border-white/15 bg-[var(--adrith-card)] px-4 py-3">
        <p className="text-xs text-[var(--adrith-dim-2)]">{CATEGORY_LABELS[booking.category] ?? booking.category}</p>
        {Object.keys(booking.details ?? {}).length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {Object.entries(booking.details).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between text-xs">
                <span className="text-[var(--adrith-dim-2)]">{DETAIL_LABELS[key] ?? key}</span>
                <span>{value}</span>
              </div>
            ))}
          </div>
        )}
        {booking.description && <p className="mt-2 border-t border-white/10 pt-2 text-sm">{booking.description}</p>}
        {booking.admin_note && <p className="mt-2 text-xs text-[var(--adrith-dim-2)]">{booking.admin_note}</p>}
      </div>

      <div>
        <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">Deliverables</p>
        {deliverables.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {deliverables.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => downloadFile(d.storage_path, d.file_name)}
                className="flex items-center justify-between rounded-lg border border-white/15 bg-[var(--adrith-card)] px-3 py-2.5 text-left"
              >
                <span className="text-sm">{d.file_name}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--adrith-rust)]">Download</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-white/15 px-4 py-4 text-center text-xs text-[var(--adrith-dim-2)]">
            Nothing uploaded yet.
          </p>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {isAdmin && !["delivered", "cancelled"].includes(booking.status) && (
        <div className="flex flex-col gap-2 rounded-xl border border-white/15 bg-[var(--adrith-card)] px-4 py-3">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">Upload Deliverable</p>
          <input
            type="file"
            accept="application/pdf,image/*"
            disabled={uploading}
            onChange={handleUpload}
            className="text-xs text-[var(--adrith-dim-2)] file:mr-3 file:rounded-md file:border file:border-white/20 file:bg-black file:px-3 file:py-1.5 file:text-xs file:text-[var(--adrith-off-white)]"
          />
          {uploading && <p className="text-[11px] text-[var(--adrith-dim-2)]">Uploading…</p>}
        </div>
      )}

      {isAdmin && booking.status === "booked" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => setStatus("in_progress")}
          className="rounded-xl border border-white/20 px-4 py-3 text-center text-sm text-[var(--adrith-off-white)]"
        >
          Mark In Progress
        </button>
      )}
      {isAdmin && ["booked", "in_progress"].includes(booking.status) && (
        <button
          type="button"
          disabled={busy}
          onClick={() => setStatus("delivered")}
          className="rounded-xl bg-[var(--adrith-rust)] px-4 py-3 text-center text-sm font-semibold text-black disabled:opacity-50"
        >
          Mark Delivered
        </button>
      )}
      {isAdmin && !["delivered", "cancelled"].includes(booking.status) && (
        <button
          type="button"
          disabled={busy}
          onClick={() => setStatus("cancelled")}
          className="text-center font-mono text-xs uppercase tracking-wider text-[var(--adrith-dim-2)] underline"
        >
          Cancel this booking
        </button>
      )}
    </div>
  );
}
