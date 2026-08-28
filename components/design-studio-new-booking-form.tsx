"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const CATEGORIES: { value: string; label: string }[] = [
  { value: "concept_plan", label: "Concept Plan" },
  { value: "three_d_designs", label: "3D Designs" },
  { value: "civil_execution_drawings", label: "Civil Execution Drawings" },
  { value: "finishing_execution_drawings", label: "Finishing Execution Drawings" },
];

export function NewBookingForm({ userId }: { userId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!category) {
      setError("Choose what you'd like to book.");
      return;
    }
    if (!description.trim()) {
      setError("Add a short description of what you need.");
      return;
    }
    setSubmitting(true);
    const { data: booking, error: bookingError } = await supabase
      .from("design_studio_bookings")
      .insert({ user_id: userId, category, description: description.trim(), status: "booked" })
      .select("id")
      .single();
    setSubmitting(false);
    if (bookingError || !booking) {
      setError(bookingError?.message ?? "Could not submit the booking.");
      return;
    }
    router.push(`/dashboard/design-studio/${booking.id}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-xs text-[var(--adrith-dim-2)]">What would you like to book?</p>
        <div className="flex flex-col gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              className={`rounded-lg border px-3 py-2.5 text-left text-sm ${
                category === c.value
                  ? "border-[var(--adrith-rust)] bg-[var(--adrith-rust)]/15 text-[var(--adrith-off-white)]"
                  : "border-white/20 bg-[var(--adrith-card)] text-[var(--adrith-dim-2)]"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <label className="text-xs text-[var(--adrith-dim-2)]">
        Brief description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="A line or two about what you're looking for — we'll call to collect full details."
          className="mt-1 w-full rounded-lg border border-white/20 bg-[var(--adrith-card)] px-3 py-2.5 text-sm text-[var(--adrith-off-white)] outline-none"
        />
      </label>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="button"
        disabled={submitting}
        onClick={submit}
        className="rounded-xl bg-[var(--adrith-rust)] px-4 py-3 text-center text-sm font-semibold text-black disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit Booking"}
      </button>
      <p className="text-center text-[11px] text-[var(--adrith-dim-2)]">
        We'll be in touch to collect the full details — no price shown yet, that's still being worked out.
      </p>
    </div>
  );
}
