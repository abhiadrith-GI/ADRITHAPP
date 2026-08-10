import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { StandardHeightsSheet } from "./standard-heights-sheet";

export default async function StandardHeightsPage({
  searchParams,
}: {
  searchParams: Promise<{ trade?: string }>;
}) {
  const { trade } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const initialTrade = trade === "plumbing" || trade === "electrical" ? trade : "all";

  return <StandardHeightsSheet initialTrade={initialTrade} />;
}
