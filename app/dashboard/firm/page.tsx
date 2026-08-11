import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { RingBackground } from "@/components/ring-background";
import { InviteTeammateForm } from "@/components/invite-teammate-form";
import { NoFirmRecovery } from "@/components/no-firm-recovery";

const SUBSCRIPTION_LABEL: Record<string, { text: string; className: string }> = {
  pending: { text: "Not active yet", className: "border-[var(--adrith-rust)] text-[var(--adrith-rust)]" },
  active: { text: "Active", className: "border-emerald-500/50 text-emerald-400" },
  past_due: { text: "Payment past due", className: "border-red-500/50 text-red-400" },
  cancelled: { text: "Cancelled", className: "border-white/20 text-[var(--adrith-dim-2)]" },
};

export default async function FirmPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, firm_id, is_firm_admin")
    .eq("id", user.id)
    .single();

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <RingBackground cyPercent={7} bright={false} />

      <div className="relative z-10 mx-auto max-w-md">
        <Link href="/dashboard" className="text-xs text-[var(--adrith-dim-2)]">
          ← Dashboard
        </Link>
        <h1 className="mb-6 mt-2 text-xl font-semibold">Your Firm</h1>

        {profile?.role === "shop_owner" ? (
          <p className="text-sm text-[var(--adrith-dim-2)]">
            Shop accounts aren&apos;t part of a firm — you work across
            projects by invite instead.
          </p>
        ) : !profile?.firm_id ? (
          <NoFirmRecovery />
        ) : (
          <FirmDetails firmId={profile.firm_id} isFirmAdmin={profile.is_firm_admin} />
        )}
      </div>
    </main>
  );
}

async function FirmDetails({ firmId, isFirmAdmin }: { firmId: string; isFirmAdmin: boolean }) {
  const supabase = await createClient();

  const [{ data: firm }, { data: members }, { data: invites }] = await Promise.all([
    supabase.from("firms").select("name, subscription_status, created_at").eq("id", firmId).single(),
    supabase
      .from("profiles")
      .select("id, full_name, role, is_firm_admin")
      .eq("firm_id", firmId)
      .order("full_name"),
    isFirmAdmin
      ? supabase
          .from("firm_invites")
          .select("id, invited_email, status, created_at")
          .eq("firm_id", firmId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: null }),
  ]);

  const subStatus = firm ? SUBSCRIPTION_LABEL[firm.subscription_status] : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border-[2.2px] border-white/20 bg-[var(--adrith-card)] p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-lg font-semibold">{firm?.name}</p>
          {subStatus && (
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${subStatus.className}`}>
              {subStatus.text}
            </span>
          )}
        </div>
        {firm?.subscription_status === "pending" && (
          <p className="mt-2 text-xs text-[var(--adrith-dim-2)]">
            Your subscription isn&apos;t active yet, so new projects can&apos;t
            be created under this firm until it is. Contact support to get
            activated.
          </p>
        )}
      </div>

      <div>
        <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">
          Team ({members?.length ?? 0})
        </div>
        <div className="flex flex-col gap-2">
          {members?.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-lg border border-white/20 bg-[var(--adrith-card)] px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium">{m.full_name}</p>
                <p className="text-xs capitalize text-[var(--adrith-dim-2)]">{m.role}</p>
              </div>
              {m.is_firm_admin && (
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-black">
                  Admin
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {isFirmAdmin && (
        <div>
          <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">
            Invite a teammate
          </div>
          <InviteTeammateForm firmId={firmId} />

          {invites && invites.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              <p className="text-[11px] text-[var(--adrith-dim-2)]">Pending invites</p>
              {invites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[var(--adrith-dim-2)]"
                >
                  <span>{inv.invited_email}</span>
                  <span>Pending</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
