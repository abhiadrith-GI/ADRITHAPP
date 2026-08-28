import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageBackground } from "@/components/page-background";
import { AdrithLogo } from "@/components/adrith-logo";

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

export default async function DesignStudioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_platform_admin").eq("id", user.id).single();
  const isAdmin = profile?.is_platform_admin ?? false;

  const bookingsQuery = supabase
    .from("design_studio_bookings")
    .select("id, category, status, created_at, user_id")
    .order("created_at", { ascending: false });
  const { data: bookings } = isAdmin ? await bookingsQuery : await bookingsQuery.eq("user_id", user.id);

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <PageBackground src="/backgrounds/design-studio.jpg" />
      <div className="relative z-10 mx-auto max-w-md">
        <div className="mb-5 flex items-center gap-2">
          <AdrithLogo className="h-5 w-auto" />
          <span className="text-xs font-bold tracking-[0.2em]">ADRITH</span>
        </div>
        <Link href="/dashboard" className="font-mono text-xs text-[var(--adrith-dim-2)]">
          ← Dashboard
        </Link>
        <h1 className="mb-1 mt-3 text-lg font-bold">Adrith Design Studio</h1>
        <p className="mb-6 text-sm text-[var(--adrith-dim-2)]">
          Concept plans, 3D designs, and execution drawings — book what you need, we'll be in touch to collect details, and deliver the finished work here as PDF/image files.
        </p>

        <Link
          href="/dashboard/design-studio/new"
          className="mb-6 block rounded-xl bg-[var(--adrith-rust)] px-4 py-3 text-center text-sm font-semibold text-black"
        >
          + New Booking
        </Link>

        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">
            {isAdmin ? "All Bookings" : "Your Bookings"}
          </p>
          {bookings && bookings.length > 0 ? (
            <div className="flex flex-col gap-2">
              {bookings.map((b) => (
                <Link
                  key={b.id}
                  href={`/dashboard/design-studio/${b.id}`}
                  className="block rounded-xl border border-white/20 bg-[var(--adrith-card)] px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{CATEGORY_LABELS[b.category] ?? b.category}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--adrith-rust)]">
                      {new Date(b.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">{STATUS_LABELS[b.status] ?? b.status}</p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-[var(--adrith-dim-2)]">
              No bookings yet — start one above.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
