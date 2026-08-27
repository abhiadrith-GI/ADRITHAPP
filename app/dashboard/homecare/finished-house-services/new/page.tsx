import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageBackground } from "@/components/page-background";
import { AdrithLogo } from "@/components/adrith-logo";
import { NewServiceRequestForm } from "@/components/finished-house-new-request-form";

export default async function NewServiceRequestPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
        <h1 className="mb-1 mt-3 text-lg font-bold">New Service Request</h1>
        <p className="mb-5 text-sm text-[var(--adrith-dim-2)]">Tell us what's going on — we'll send a quotation once we've reviewed it.</p>

        <NewServiceRequestForm userId={user.id} />
      </div>
    </main>
  );
}
