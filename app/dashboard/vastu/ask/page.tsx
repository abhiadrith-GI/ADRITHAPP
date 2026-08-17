import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageBackground } from "@/components/page-background";
import { AskVastuTool } from "./ask-vastu-tool";

export default async function AskVastuPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-[var(--adrith-off-white)]">
      <PageBackground src="/backgrounds/vastu.jpg" />
      <div className="relative z-10 mx-auto max-w-md px-5 pb-16 pt-8">
        <Link href="/dashboard/vastu" className="text-xs text-[var(--adrith-dim-2)]">
          ← Vastu Consultation
        </Link>
        <h1 className="mt-3 text-xl font-semibold">Ask Vastu</h1>
        <p className="mt-1 text-sm text-[var(--adrith-dim-2)]">
          A real conversation — ask questions, share a photo if it helps,
          get answers grounded in the same guidance as the rest of this
          tool.
        </p>

        <AskVastuTool />
      </div>
    </main>
  );
}
