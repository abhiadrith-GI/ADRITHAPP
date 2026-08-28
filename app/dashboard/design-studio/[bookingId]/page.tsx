import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PageBackground } from "@/components/page-background";
import { AdrithLogo } from "@/components/adrith-logo";
import { BookingDetail } from "@/components/design-studio-booking-detail";

export default async function DesignStudioBookingPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_platform_admin").eq("id", user.id).single();
  const isAdmin = profile?.is_platform_admin ?? false;

  const { data: booking } = await supabase.from("design_studio_bookings").select("*").eq("id", bookingId).single();
  if (!booking) notFound();

  const { data: deliverables } = await supabase
    .from("design_studio_deliverables")
    .select("id, storage_path, file_name, uploaded_at")
    .eq("booking_id", bookingId)
    .order("uploaded_at");

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <PageBackground src="/backgrounds/design-studio.jpg" />
      <div className="relative z-10 mx-auto max-w-md">
        <div className="mb-5 flex items-center gap-2">
          <AdrithLogo className="h-5 w-auto" />
          <span className="text-xs font-bold tracking-[0.2em]">ADRITH</span>
        </div>
        <Link href="/dashboard/design-studio" className="font-mono text-xs text-[var(--adrith-dim-2)]">
          ← Adrith Design Studio
        </Link>
        <h1 className="mb-4 mt-3 text-lg font-bold">Booking Detail</h1>

        <BookingDetail booking={booking} deliverables={deliverables ?? []} isAdmin={isAdmin} />
      </div>
    </main>
  );
}
