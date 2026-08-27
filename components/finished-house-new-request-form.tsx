"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const SERVICE_TYPES: { value: string; label: string }[] = [
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "waterproofing", label: "Waterproofing" },
  { value: "painting", label: "Painting" },
  { value: "masonry_plaster", label: "Masonry / Plaster" },
  { value: "carpentry", label: "Carpentry" },
  { value: "pest_control", label: "Pest Control" },
  { value: "deep_cleaning", label: "Deep Cleaning" },
];

export function NewServiceRequestForm({ userId }: { userId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [serviceType, setServiceType] = useState("");
  const [description, setDescription] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!serviceType) {
      setError("Choose a service type.");
      return;
    }
    if (!description.trim() || !propertyAddress.trim()) {
      setError("Description and property address are both required.");
      return;
    }
    setSubmitting(true);
    const { data: request, error: reqError } = await supabase
      .from("finished_house_service_requests")
      .insert({
        user_id: userId,
        service_type: serviceType,
        description: description.trim(),
        property_address: propertyAddress.trim(),
        status: "enquired",
      })
      .select("id")
      .single();
    setSubmitting(false);
    if (reqError || !request) {
      setError(reqError?.message ?? "Could not submit the request.");
      return;
    }
    router.push(`/dashboard/homecare/finished-house-services/${request.id}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-xs text-[var(--adrith-dim-2)]">Service type</p>
        <div className="grid grid-cols-2 gap-2">
          {SERVICE_TYPES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setServiceType(s.value)}
              className={`rounded-lg border px-3 py-2.5 text-left text-sm ${
                serviceType === s.value
                  ? "border-[var(--adrith-rust)] bg-[var(--adrith-rust)]/15 text-[var(--adrith-off-white)]"
                  : "border-white/20 bg-[var(--adrith-card)] text-[var(--adrith-dim-2)]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <label className="text-xs text-[var(--adrith-dim-2)]">
        What's the issue?
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Describe what you need done — be as specific as you can."
          className="mt-1 w-full rounded-lg border border-white/20 bg-[var(--adrith-card)] px-3 py-2.5 text-sm text-[var(--adrith-off-white)] outline-none"
        />
      </label>

      <label className="text-xs text-[var(--adrith-dim-2)]">
        Property address
        <textarea
          value={propertyAddress}
          onChange={(e) => setPropertyAddress(e.target.value)}
          rows={2}
          placeholder="Where the work is needed"
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
        {submitting ? "Submitting…" : "Submit Enquiry"}
      </button>
      <p className="text-center text-[11px] text-[var(--adrith-dim-2)]">
        No price yet — we'll review and send a quotation before anything's confirmed.
      </p>
    </div>
  );
}
