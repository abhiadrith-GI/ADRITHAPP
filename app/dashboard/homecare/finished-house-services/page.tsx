import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageBackground } from "@/components/page-background";
import { AdrithLogo } from "@/components/adrith-logo";

const SERVICE_LABELS: Record<string, string> = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  waterproofing: "Waterproofing",
  painting: "Painting",
  masonry_plaster: "Masonry / Plaster",
  carpentry: "Carpentry",
  pest_control: "Pest Control",
  deep_cleaning: "Deep Cleaning",
};

const STATUS_LABELS: Record<string, string> = {
  enquired: "Enquiry sent — awaiting quotation",
  quoted: "Quotation ready — review & approve",
  awaiting_payment: "Approved — payment pending",
  paid: "Paid — scheduled",
  complete: "Complete",
  cancelled: "Cancelled",
};

export default async function FinishedHouseServicesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_platform_admin").eq("id", user.id).single();
  const isAdmin = profile?.is_platform_admin ?? false;

  const requestsQuery = supabase
    .from("finished_house_service_requests")
    .select("id, service_type, status, created_at, user_id")
    .order("created_at", { ascending: false });
  const { data: requests } = isAdmin ? await requestsQuery : await requestsQuery.eq("user_id", user.id);

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <PageBackground src="/backgrounds/homecare.jpg" />
      <div className="relative z-10 mx-auto max-w-md">
        <div className="mb-5 flex items-center gap-2">
          <AdrithLogo className="h-5 w-auto" />
          <span className="text-xs font-bold tracking-[0.2em]">ADRITH</span>
        </div>
        <Link href="/dashboard/homecare" className="font-mono text-xs text-[var(--adrith-dim-2)]">
          ← HomeCare
        </Link>
        <h1 className="mb-1 mt-3 text-lg font-bold">Finished House Services</h1>
        <p className="mb-5 text-sm text-[var(--adrith-dim-2)]">
          Plumbing, electrical, waterproofing, painting, masonry, carpentry, pest control & deep cleaning — for after handover. Describe what you need; we'll send a quotation before anything's confirmed.
        </p>

        <Link
          href="/dashboard/homecare/finished-house-services/new"
          className="mb-6 block rounded-xl bg-[var(--adrith-rust)] px-4 py-3 text-center text-sm font-semibold text-black"
        >
          + New Service Request
        </Link>

        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">
            {isAdmin ? "All Requests" : "Your Requests"}
          </p>
          {requests && requests.length > 0 ? (
            <div className="flex flex-col gap-2">
              {requests.map((r) => (
                <Link
                  key={r.id}
                  href={`/dashboard/homecare/finished-house-services/${r.id}`}
                  className="block rounded-xl border border-white/20 bg-[var(--adrith-card)] px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{SERVICE_LABELS[r.service_type] ?? r.service_type}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--adrith-rust)]">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">{STATUS_LABELS[r.status] ?? r.status}</p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-[var(--adrith-dim-2)]">
              No requests yet — start one above.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
