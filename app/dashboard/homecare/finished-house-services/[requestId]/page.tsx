import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PageBackground } from "@/components/page-background";
import { AdrithLogo } from "@/components/adrith-logo";
import { ServiceRequestDetail } from "@/components/finished-house-request-detail";

export default async function ServiceRequestPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_platform_admin").eq("id", user.id).single();
  const isAdmin = profile?.is_platform_admin ?? false;

  const { data: request } = await supabase.from("finished_house_service_requests").select("*").eq("id", requestId).single();
  if (!request) notFound();

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <PageBackground src="/backgrounds/homecare.jpg" />
      <div className="relative z-10 mx-auto max-w-md">
        <div className="mb-5 flex items-center gap-2">
          <AdrithLogo className="h-5 w-auto" />
          <span className="text-xs font-bold tracking-[0.2em]">ADRITH</span>
        </div>
        <Link href="/dashboard/homecare/finished-house-services" className="font-mono text-xs text-[var(--adrith-dim-2)]">
          ← Finished House Services
        </Link>
        <h1 className="mb-4 mt-3 text-lg font-bold">Service Request</h1>

        <ServiceRequestDetail request={request} isAdmin={isAdmin} />
      </div>
    </main>
  );
}
