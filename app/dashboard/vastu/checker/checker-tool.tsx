"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ROOM_RULES, ROOM_TYPES, type RoomType } from "@/lib/vastu/rules";
import { ZONE_NAMES, ZONE_THEME, type ZoneName } from "@/lib/vastu/zones";
import { buildVastuReport, scoreBand, type RoomAnswer, type VastuReport } from "@/lib/vastu/scoring";

type Stage = "disclaimer" | "select_rooms" | "direction" | "review" | "saving" | "report" | "error";

// 8 primary compass buttons, arranged for a real 3x3 grid (center empty).
const COMPASS_GRID: (ZoneName | null)[] = ["NW", "N", "NE", "W", null, "E", "SW", "S", "SE"];

const ZONE_INDEX: Record<ZoneName, number> = Object.fromEntries(ZONE_NAMES.map((z, i) => [z, i])) as Record<ZoneName, number>;

function zoneToBearing(zone: ZoneName): number {
  return ZONE_INDEX[zone] * 22.5;
}

export function VastuCheckerTool() {
  const supabase = createClient();
  const [stage, setStage] = useState<Stage>("disclaimer");
  const [selectedRooms, setSelectedRooms] = useState<Set<RoomType>>(new Set(ROOM_TYPES));
  const [roomQueue, setRoomQueue] = useState<RoomType[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<RoomType, ZoneName>>(new Map());
  const [report, setReport] = useState<VastuReport | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function startQuestionnaire() {
    setStage("select_rooms");
  }

  function beginDirections() {
    const queue = ROOM_TYPES.filter((r) => selectedRooms.has(r));
    if (queue.length === 0) {
      setMessage("Pick at least one room to check.");
      return;
    }
    setMessage(null);
    setRoomQueue(queue);
    setQueueIndex(0);
    setStage("direction");
  }

  function confirmZone(zone: ZoneName) {
    const room = roomQueue[queueIndex];
    const next = new Map(answers);
    next.set(room, zone);
    setAnswers(next);

    if (queueIndex + 1 < roomQueue.length) {
      setQueueIndex(queueIndex + 1);
    } else {
      setStage("review");
    }
  }

  async function submitAssessment() {
    setStage("saving");
    setMessage(null);
    try {
      const roomAnswers: RoomAnswer[] = Array.from(answers.entries()).map(([room, zone]) => ({
        room,
        bearingDegrees: zoneToBearing(zone),
        source: "questionnaire",
      }));
      const computed = buildVastuReport(roomAnswers);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("You've been signed out — please log in again.");

      const { error } = await supabase
        .from("vastu_assessments")
        .insert({ user_id: user.id, answers: roomAnswers, report: computed });
      if (error) throw new Error(error.message);

      setReport(computed);
      setStage("report");
    } catch (err) {
      setStage("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong saving this assessment.");
    }
  }

  function reset() {
    setStage("select_rooms");
    setAnswers(new Map());
    setReport(null);
    setMessage(null);
  }

  // ---------------------------------------------------------------------

  if (stage === "disclaimer") {
    return (
      <div className="mt-6 rounded-xl border border-[var(--adrith-rust)] bg-[var(--adrith-card)] p-4">
        <p className="text-sm font-semibold text-[var(--adrith-rust)]">Before you start</p>
        <p className="mt-2 text-sm leading-relaxed">
          Recommendations here are for awareness only, based on general Vastu
          guidance — not a guaranteed outcome, and not a replacement for a
          structural engineer&apos;s assessment. Different consultants can
          reasonably read the same home differently. Any change should only be
          carried out after formal consultation and approval — Adrith Designs
          is not responsible for outcomes from changes made without it.
        </p>
        <button
          onClick={startQuestionnaire}
          className="mt-4 w-full rounded-lg bg-[var(--adrith-rust)] py-3 text-sm font-semibold text-black"
        >
          I understand — continue
        </button>
      </div>
    );
  }

  if (stage === "select_rooms") {
    return (
      <div className="mt-6">
        <p className="text-sm font-semibold">Which rooms do you want checked?</p>
        <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">
          All selected by default — uncheck anything you don&apos;t have or don&apos;t want included.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {ROOM_TYPES.map((room) => (
            <label
              key={room}
              className="flex items-center gap-3 rounded-lg border border-white/15 bg-[var(--adrith-card)] px-3 py-2.5 text-sm"
            >
              <input
                type="checkbox"
                checked={selectedRooms.has(room)}
                onChange={(e) => {
                  const next = new Set(selectedRooms);
                  if (e.target.checked) next.add(room);
                  else next.delete(room);
                  setSelectedRooms(next);
                }}
              />
              {ROOM_RULES[room].label}
            </label>
          ))}
        </div>
        {message && <p className="mt-3 text-xs text-[var(--adrith-rust)]">{message}</p>}
        <button
          onClick={beginDirections}
          className="mt-4 w-full rounded-lg bg-[var(--adrith-rust)] py-3 text-sm font-semibold text-black"
        >
          Continue
        </button>
      </div>
    );
  }

  if (stage === "direction") {
    const room = roomQueue[queueIndex];
    return (
      <div className="mt-6">
        <p className="text-xs text-[var(--adrith-dim-2)]">
          Room {queueIndex + 1} of {roomQueue.length}
        </p>
        <p className="mt-1 text-sm font-semibold">
          Stand at the center of your home, facing your {ROOM_RULES[room].label.toLowerCase()}.
          Which direction are you facing?
        </p>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {COMPASS_GRID.map((zone, i) =>
            zone === null ? (
              <div key={i} />
            ) : (
              <button
                key={zone}
                onClick={() => confirmZone(zone)}
                className="aspect-square rounded-lg border border-white/20 bg-[var(--adrith-card)] text-sm font-semibold"
              >
                {zone}
              </button>
            )
          )}
        </div>
      </div>
    );
  }

  if (stage === "review") {
    return (
      <div className="mt-6">
        <p className="text-sm font-semibold">Quick check before we score this</p>
        <div className="mt-3 flex flex-col gap-1.5">
          {Array.from(answers.entries()).map(([room, zone]) => (
            <div key={room} className="flex justify-between rounded-lg border border-white/10 px-3 py-2 text-xs">
              <span>{ROOM_RULES[room].label}</span>
              <span className="text-[var(--adrith-dim-2)]">{zone}</span>
            </div>
          ))}
        </div>
        {message && <p className="mt-3 text-xs text-[var(--adrith-rust)]">{message}</p>}
        <button
          onClick={submitAssessment}
          className="mt-4 w-full rounded-lg bg-[var(--adrith-rust)] py-3 text-sm font-semibold text-black"
        >
          Get my report
        </button>
      </div>
    );
  }

  if (stage === "saving") {
    return <p className="mt-6 text-sm">Working it out…</p>;
  }

  if (stage === "error") {
    return (
      <div className="mt-6">
        <p className="text-sm text-[var(--adrith-rust)]">{message}</p>
        <button onClick={reset} className="mt-3 text-sm underline">
          Start over
        </button>
      </div>
    );
  }

  if (stage === "report" && report) {
    const band = scoreBand(report.overallScore);
    return (
      <div className="mt-6">
        <div className="rounded-xl border border-white/15 bg-[var(--adrith-card)] p-4 text-center">
          <p className="text-3xl font-bold text-[var(--adrith-rust)]">{report.overallScore}<span className="text-base text-[var(--adrith-dim-2)]">/100</span></p>
          <p className="mt-1 text-sm font-semibold">{band.label}</p>
          <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">{band.description}</p>
        </div>

        {report.hasLowConfidenceInput && (
          <p className="mt-3 text-xs text-[var(--adrith-dim-2)]">
            Based on approximate input — a scaled plan gives more precise results.
          </p>
        )}

        <div className="mt-5 flex flex-col gap-3">
          {report.roomResults.map((r) => (
            <div key={r.room} className="rounded-lg border border-white/10 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{r.label}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    r.status === "ideal"
                      ? "bg-green-900/50 text-green-400"
                      : r.status === "acceptable"
                        ? "bg-blue-900/50 text-blue-400"
                        : r.status === "avoid"
                          ? r.severity === "major"
                            ? "bg-red-900/50 text-red-400"
                            : "bg-yellow-900/50 text-yellow-400"
                          : "bg-white/10 text-[var(--adrith-dim-2)]"
                  }`}
                >
                  {r.status === "avoid" ? `${r.severity}` : r.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">
                {r.zone} — {ZONE_THEME[r.zone]}
              </p>
              {r.realReason && <p className="mt-1.5 text-xs">{r.realReason}</p>}
              {r.remedy && (
                <p className="mt-1.5 text-xs">
                  <span className="text-[var(--adrith-rust)]">Non-demolition remedy: </span>
                  {r.remedy}
                </p>
              )}
            </div>
          ))}
        </div>

        <p className="mt-5 text-xs leading-relaxed text-[var(--adrith-dim-2)]">
          This is a starting point, not a final verdict. For a full read, or
          before making any change, talk to us directly.
        </p>

        <button onClick={reset} className="mt-4 w-full rounded-lg border border-white/20 py-3 text-sm">
          Check again
        </button>
      </div>
    );
  }

  return null;
}
