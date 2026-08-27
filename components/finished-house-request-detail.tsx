"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Request = {
  id: string;
  service_type: string;
  description: string;
  property_address: string;
  status: string;
  quoted_price: number | null;
  scheduled_date: string | null;
  admin_note: string | null;
  completion_report: string | null;
};

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

export function ServiceRequestDetail({ request, isAdmin }: { request: Request; isAdmin: boolean }) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [quotePrice, setQuotePrice] = useState(request.quoted_price != null ? String(request.quoted_price) : "");
  const [quoteDate, setQuoteDate] = useState(request.scheduled_date ? request.scheduled_date.slice(0, 10) : "");
  const [quoteNote, setQuoteNote] = useState(request.admin_note ?? "");
  const [report, setReport] = useState(request.completion_report ?? "");

  function refresh() {
    router.refresh();
  }

  async function sendQuotation() {
    const price = Number(quotePrice);
    if (!Number.isFinite(price) || price <= 0) {
      setError("Enter a valid quotation amount.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: e } = await supabase
      .from("finished_house_service_requests")
      .update({
        status: "quoted",
        quoted_price: price,
        scheduled_date: quoteDate ? new Date(quoteDate).toISOString() : null,
        admin_note: quoteNote.trim() || null,
        quoted_at: new Date().toISOString(),
      })
      .eq("id", request.id);
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    refresh();
  }

  async function approveQuote() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase
      .from("finished_house_service_requests")
      .update({ status: "awaiting_payment" })
      .eq("id", request.id);
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    refresh();
  }

  async function markPaid() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase
      .from("finished_house_service_requests")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", request.id);
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    refresh();
  }

  async function markComplete() {
    if (!report.trim()) {
      setError("Add a short completion note before closing this out.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: e } = await supabase
      .from("finished_house_service_requests")
      .update({ status: "complete", completion_report: report.trim(), completed_at: new Date().toISOString() })
      .eq("id", request.id);
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    refresh();
  }

  async function cancelRequest() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.from("finished_house_service_requests").update({ status: "cancelled" }).eq("id", request.id);
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-[var(--adrith-rust)] bg-[var(--adrith-card)] px-4 py-3">
        <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-rust)]">Status</p>
        <p className="mt-0.5 text-sm font-semibold">{STATUS_LABELS[request.status] ?? request.status}</p>
      </div>

      <div className="rounded-xl border border-white/15 bg-[var(--adrith-card)] px-4 py-3">
        <p className="text-xs text-[var(--adrith-dim-2)]">{SERVICE_LABELS[request.service_type] ?? request.service_type}</p>
        <p className="mt-1 text-sm">{request.description}</p>
        <p className="mt-2 text-xs text-[var(--adrith-dim-2)]">{request.property_address}</p>
      </div>

      {request.quoted_price != null && (
        <div className="rounded-xl border border-white/15 bg-[var(--adrith-card)] px-4 py-3">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">Quotation</p>
          <p className="mt-1 text-lg font-semibold text-[var(--adrith-rust)]">₹{request.quoted_price}</p>
          {request.scheduled_date && (
            <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">
              Scheduled: {new Date(request.scheduled_date).toLocaleDateString()}
            </p>
          )}
          {request.admin_note && <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">{request.admin_note}</p>}
        </div>
      )}

      {request.completion_report && (
        <div className="rounded-xl border border-white/15 bg-[var(--adrith-card)] px-4 py-3">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">Completion Report</p>
          <p className="mt-1 text-sm">{request.completion_report}</p>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Customer: approve a quote */}
      {!isAdmin && request.status === "quoted" && (
        <button
          type="button"
          disabled={busy}
          onClick={approveQuote}
          className="rounded-xl bg-[var(--adrith-rust)] px-4 py-3 text-center text-sm font-semibold text-black disabled:opacity-50"
        >
          {busy ? "…" : "Approve Quotation"}
        </button>
      )}

      {/* Customer: payment pending, no gateway yet */}
      {!isAdmin && request.status === "awaiting_payment" && (
        <div className="rounded-xl border border-dashed border-white/20 px-4 py-4 text-center">
          <p className="text-sm font-medium">Ready to pay</p>
          <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">
            Online payment is being set up — Adrith will contact you directly to complete payment for now.
          </p>
        </div>
      )}

      {/* Admin: send a quotation */}
      {isAdmin && request.status === "enquired" && (
        <div className="flex flex-col gap-2 rounded-xl border border-white/15 bg-[var(--adrith-card)] px-4 py-3">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">Send Quotation</p>
          <label className="text-xs text-[var(--adrith-dim-2)]">
            Price (₹)
            <input
              type="number"
              value={quotePrice}
              onChange={(e) => setQuotePrice(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/20 bg-black px-2 py-1.5 text-sm text-[var(--adrith-off-white)]"
            />
          </label>
          <label className="text-xs text-[var(--adrith-dim-2)]">
            Scheduled date (optional)
            <input
              type="date"
              value={quoteDate}
              onChange={(e) => setQuoteDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/20 bg-black px-2 py-1.5 text-sm text-[var(--adrith-off-white)]"
            />
          </label>
          <label className="text-xs text-[var(--adrith-dim-2)]">
            Note (optional)
            <input
              type="text"
              value={quoteNote}
              onChange={(e) => setQuoteNote(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/20 bg-black px-2 py-1.5 text-sm text-[var(--adrith-off-white)]"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={sendQuotation}
            className="mt-1 rounded-xl bg-[var(--adrith-rust)] px-4 py-3 text-center text-sm font-semibold text-black disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send Quotation"}
          </button>
        </div>
      )}

      {isAdmin && request.status === "awaiting_payment" && (
        <button
          type="button"
          disabled={busy}
          onClick={markPaid}
          className="rounded-xl bg-[var(--adrith-rust)] px-4 py-3 text-center text-sm font-semibold text-black disabled:opacity-50"
        >
          Mark Paid (collected outside the app)
        </button>
      )}

      {isAdmin && request.status === "paid" && (
        <div className="flex flex-col gap-2 rounded-xl border border-white/15 bg-[var(--adrith-card)] px-4 py-3">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">Completion Report</p>
          <textarea
            value={report}
            onChange={(e) => setReport(e.target.value)}
            rows={3}
            placeholder="What was done"
            className="w-full rounded-md border border-white/20 bg-black px-2 py-1.5 text-sm text-[var(--adrith-off-white)]"
          />
          <button
            type="button"
            disabled={busy}
            onClick={markComplete}
            className="rounded-xl bg-[var(--adrith-rust)] px-4 py-3 text-center text-sm font-semibold text-black disabled:opacity-50"
          >
            Mark Complete
          </button>
        </div>
      )}

      {isAdmin && !["complete", "cancelled"].includes(request.status) && (
        <button
          type="button"
          disabled={busy}
          onClick={cancelRequest}
          className="text-center font-mono text-xs uppercase tracking-wider text-[var(--adrith-dim-2)] underline"
        >
          Cancel this request
        </button>
      )}
    </div>
  );
}
