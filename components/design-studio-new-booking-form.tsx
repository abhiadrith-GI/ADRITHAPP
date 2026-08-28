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

const ROAD_FACING = ["North", "South", "East", "West"];
const BHK_OPTIONS = ["1 BHK", "2 BHK", "3 BHK", "4+ BHK"];
const STYLE_OPTIONS = ["Modern", "Traditional", "Contemporary", "Other"];
const VIEWS_OPTIONS = ["Exterior only", "Exterior + Interior"];
const REFERENCE_OPTIONS = ["Booked here on Adrith Design Studio", "I'll share my own", "Don't have one yet"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-xs text-[var(--adrith-dim-2)]">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-white/20 bg-[var(--adrith-card)] px-3 py-2.5 text-sm text-[var(--adrith-off-white)] outline-none"
    />
  );
}

function PillSelect({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`rounded-md border px-3 py-1.5 text-xs ${
            value === o
              ? "border-[var(--adrith-rust)] bg-[var(--adrith-rust)]/15 text-[var(--adrith-off-white)]"
              : "border-white/20 bg-[var(--adrith-card)] text-[var(--adrith-dim-2)]"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function NewBookingForm({ userId }: { userId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setDetail(key: string, value: string) {
    setDetails((prev) => ({ ...prev, [key]: value }));
  }

  function requiredFieldsMissing(): string | null {
    if (category === "concept_plan") {
      if (!details.plot_width || !details.plot_depth) return "Enter both plot width and depth.";
      if (!details.road_facing) return "Choose the road-facing direction.";
      if (!details.floors) return "Enter the number of floors.";
      if (!details.bhk) return "Choose the BHK requirement.";
      if (!details.vastu_required) return "Let us know if Vastu compliance is needed.";
    }
    if (category === "three_d_designs") {
      if (!details.has_plan) return "Let us know whether you have a floor plan already.";
      if (!details.style_preference) return "Choose a style preference.";
      if (!details.views_needed) return "Choose which views you need.";
    }
    if (category === "civil_execution_drawings") {
      if (!details.floors) return "Enter the number of floors.";
      if (!details.has_reference_plan) return "Let us know whether you have a reference plan.";
    }
    if (category === "finishing_execution_drawings") {
      if (!details.reference_design) return "Let us know whether you have a reference design.";
    }
    return null;
  }

  async function submit() {
    setError(null);
    if (!category) {
      setError("Choose what you'd like to book.");
      return;
    }
    const missing = requiredFieldsMissing();
    if (missing) {
      setError(missing);
      return;
    }
    setSubmitting(true);
    const { data: booking, error: bookingError } = await supabase
      .from("design_studio_bookings")
      .insert({ user_id: userId, category, details, description: notes.trim(), status: "booked" })
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
              onClick={() => {
                setCategory(c.value);
                setDetails({});
              }}
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

      {category === "concept_plan" && (
        <div className="flex flex-col gap-3 rounded-xl border border-white/15 bg-black/20 px-3 py-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Plot width (ft)">
              <TextInput type="number" value={details.plot_width ?? ""} onChange={(v) => setDetail("plot_width", v)} placeholder="e.g. 30" />
            </Field>
            <Field label="Plot depth (ft)">
              <TextInput type="number" value={details.plot_depth ?? ""} onChange={(v) => setDetail("plot_depth", v)} placeholder="e.g. 40" />
            </Field>
          </div>
          <Field label="Road-facing direction">
            <PillSelect options={ROAD_FACING} value={details.road_facing ?? ""} onChange={(v) => setDetail("road_facing", v)} />
          </Field>
          <Field label="Number of floors">
            <TextInput type="number" value={details.floors ?? ""} onChange={(v) => setDetail("floors", v)} placeholder="e.g. 1" />
          </Field>
          <Field label="BHK requirement">
            <PillSelect options={BHK_OPTIONS} value={details.bhk ?? ""} onChange={(v) => setDetail("bhk", v)} />
          </Field>
          <Field label="Vastu compliance needed?">
            <PillSelect options={["Yes", "No"]} value={details.vastu_required ?? ""} onChange={(v) => setDetail("vastu_required", v)} />
          </Field>
        </div>
      )}

      {category === "three_d_designs" && (
        <div className="flex flex-col gap-3 rounded-xl border border-white/15 bg-black/20 px-3 py-3">
          <Field label="Do you already have a floor plan?">
            <PillSelect options={REFERENCE_OPTIONS} value={details.has_plan ?? ""} onChange={(v) => setDetail("has_plan", v)} />
          </Field>
          <Field label="Style preference">
            <PillSelect options={STYLE_OPTIONS} value={details.style_preference ?? ""} onChange={(v) => setDetail("style_preference", v)} />
          </Field>
          <Field label="Views needed">
            <PillSelect options={VIEWS_OPTIONS} value={details.views_needed ?? ""} onChange={(v) => setDetail("views_needed", v)} />
          </Field>
        </div>
      )}

      {category === "civil_execution_drawings" && (
        <div className="flex flex-col gap-3 rounded-xl border border-white/15 bg-black/20 px-3 py-3">
          <Field label="Number of floors">
            <TextInput type="number" value={details.floors ?? ""} onChange={(v) => setDetail("floors", v)} placeholder="e.g. 2" />
          </Field>
          <Field label="Do you have a reference concept plan?">
            <PillSelect
              options={REFERENCE_OPTIONS}
              value={details.has_reference_plan ?? ""}
              onChange={(v) => setDetail("has_reference_plan", v)}
            />
          </Field>
        </div>
      )}

      {category === "finishing_execution_drawings" && (
        <div className="flex flex-col gap-3 rounded-xl border border-white/15 bg-black/20 px-3 py-3">
          <Field label="Do you have a reference design?">
            <PillSelect options={REFERENCE_OPTIONS} value={details.reference_design ?? ""} onChange={(v) => setDetail("reference_design", v)} />
          </Field>
        </div>
      )}

      {category && (
        <label className="text-xs text-[var(--adrith-dim-2)]">
          Anything else we should know? (optional)
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Any other requirements, preferences, or context"
            className="mt-1 w-full rounded-lg border border-white/20 bg-[var(--adrith-card)] px-3 py-2.5 text-sm text-[var(--adrith-off-white)] outline-none"
          />
        </label>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="button"
        disabled={submitting}
        onClick={submit}
        className="rounded-xl bg-[var(--adrith-rust)] px-4 py-3 text-center text-sm font-semibold text-black disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit Booking"}
      </button>
      <p className="text-center text-[11px] text-[var(--adrith-dim-2)]">No price shown yet — that pattern's still being worked out.</p>
    </div>
  );
}
