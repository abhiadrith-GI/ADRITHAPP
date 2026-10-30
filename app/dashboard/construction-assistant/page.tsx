import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageBackground } from "@/components/page-background";
import { ConstructionAssistantTool } from "./assistant-tool";

const DAILY_LIMIT = 12; // keep in step with enforce_construction_chat_limit() in the database

export default async function ConstructionAssistantPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("construction_chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("role", "user")
    .gte("created_at", dayStart.toISOString());

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-[var(--adrith-off-white)]">
      <PageBackground src="/backgrounds/civil-rcc.jpg" />
      <div className="relative z-10 mx-auto max-w-md px-5 pb-16 pt-8">
        <Link href="/dashboard" className="text-xs text-[var(--adrith-dim-2)]">
          ← Dashboard
        </Link>
        <h1 className="mt-3 text-xl font-semibold">Construction Assistant</h1>
        <p className="mt-1 text-sm text-[var(--adrith-dim-2)]">
          Ask anything about architecture and construction — materials, site practice, estimating, approvals, interiors.
          Free, in English, Kannada or Hindi.
        </p>

        <ConstructionAssistantTool dailyLimit={DAILY_LIMIT} usedToday={count ?? 0} />
      </div>
    </main>
  );
}
