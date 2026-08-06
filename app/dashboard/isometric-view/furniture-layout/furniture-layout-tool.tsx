"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { drawFurniturePiece } from "@/lib/furniture-shapes";

type FurnitureItem = {
  type: string;
  label: string;
  x_pct: number;
  y_pct: number;
  width_pct: number;
  depth_pct: number;
  height_ft?: number;
  rotation_deg: number;
};
type WallFeature = { wall: "top" | "bottom" | "left" | "right"; position_pct: number; width_pct: number };
type Layout = {
  room_label: string;
  doors: WallFeature[];
  windows: WallFeature[];
  furniture: FurnitureItem[];
  notes: string;
};
type QA = { question: string; answer: string };

type Stage =
  | "idle"
  | "reading"
  | "studying"
  | "answering"
  | "generating"
  | "ready"
  | "rendering"
  | "done"
  | "error";

const ROOM = 12.0;
const WALL_H = 9.0;
const CANVAS_SIZE = 1000;
const SCALE = 38;
const OFFSET_X = 490;
const OFFSET_Y = 300;

function proj(x: number, y: number, z: number) {
  const ix = (x - y) * Math.cos((30 * Math.PI) / 180) * SCALE;
  const iy = ((x + y) * Math.sin((30 * Math.PI) / 180) - z) * SCALE;
  return { x: OFFSET_X + ix, y: OFFSET_Y + iy };
}

const PALETTE = ["#d97757", "#8a6a52", "#c98a52", "#6a8a7a", "#7a7ab0", "#b08a4a"];

function drawSketchupLayout(canvas: HTMLCanvasElement, layout: Layout) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const ctx: CanvasRenderingContext2D = context;
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;

  ctx.fillStyle = "#eef0ef";
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  function poly(pts: { x: number; y: number }[], fill: string) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = "#2b2b2b";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const base = [proj(0, 0, 0), proj(ROOM, 0, 0), proj(ROOM, ROOM, 0), proj(0, ROOM, 0)];
  ctx.save();
  ctx.filter = "blur(10px)";
  ctx.beginPath();
  ctx.moveTo(base[0].x, base[0].y + 14);
  for (const p of base.slice(1)) ctx.lineTo(p.x, p.y + 14);
  ctx.closePath();
  ctx.fillStyle = "rgba(30,30,30,0.25)";
  ctx.fill();
  ctx.restore();

  poly(base, "#d8cdb8");

  const wallRight = [proj(ROOM, 0, 0), proj(ROOM, ROOM, 0), proj(ROOM, ROOM, WALL_H), proj(ROOM, 0, WALL_H)];
  const wallLeft = [proj(0, ROOM, 0), proj(ROOM, ROOM, 0), proj(ROOM, ROOM, WALL_H), proj(0, ROOM, WALL_H)];
  poly(wallLeft, "#fbfaf7");
  poly(wallRight, "#e6e3dc");

  function wallPoint(wall: WallFeature["wall"], positionPct: number, widthPct: number) {
    const p = positionPct / 100;
    const w = (widthPct / 100) * ROOM;
    if (wall === "top") return { rx: p * ROOM - w / 2, ry: 0, w };
    if (wall === "bottom") return { rx: p * ROOM - w / 2, ry: ROOM, w };
    if (wall === "left") return { rx: 0, ry: p * ROOM - w / 2, w };
    return { rx: ROOM, ry: p * ROOM - w / 2, w };
  }

  for (const win of layout.windows ?? []) {
    if (win.wall !== "right" && win.wall !== "bottom") continue;
    const wp = wallPoint(win.wall, win.position_pct, win.width_pct);
    const onRightWall = win.wall === "right";
    const p0 = onRightWall ? proj(ROOM, wp.ry, 3.2) : proj(wp.rx, ROOM, 3.2);
    const p1 = onRightWall ? proj(ROOM, wp.ry + wp.w, 3.2) : proj(wp.rx + wp.w, ROOM, 3.2);
    const p2 = onRightWall ? proj(ROOM, wp.ry + wp.w, 6.2) : proj(wp.rx + wp.w, ROOM, 6.2);
    const p3 = onRightWall ? proj(ROOM, wp.ry, 6.2) : proj(wp.rx, ROOM, 6.2);
    poly([p0, p1, p2, p3], "#a8c8de");
  }

  for (const door of layout.doors ?? []) {
    if (door.wall !== "right" && door.wall !== "bottom") continue;
    const wp = wallPoint(door.wall, door.position_pct, door.width_pct);
    const onRightWall = door.wall === "right";
    const p0 = onRightWall ? proj(ROOM, wp.ry, 0) : proj(wp.rx, ROOM, 0);
    const p1 = onRightWall ? proj(ROOM, wp.ry + wp.w, 0) : proj(wp.rx + wp.w, ROOM, 0);
    const p2 = onRightWall ? proj(ROOM, wp.ry + wp.w, 6.6) : proj(wp.rx + wp.w, ROOM, 6.6);
    const p3 = onRightWall ? proj(ROOM, wp.ry, 6.6) : proj(wp.rx, ROOM, 6.6);
    poly([p0, p1, p2, p3], "#c9b8a3");
  }

  const items = (layout.furniture ?? [])
    .map((item, i) => ({
      ...item,
      color: PALETTE[i % PALETTE.length],
      rx: (item.x_pct / 100) * ROOM,
      ry: (item.y_pct / 100) * ROOM,
      rw: (item.width_pct / 100) * ROOM,
      rd: (item.depth_pct / 100) * ROOM,
      rh: Math.min(7, Math.max(0.8, item.height_ft ?? 2.5)),
    }))
    .sort((a, b) => b.rx + b.ry - (a.rx + a.ry));

  for (const it of items) {
    // Real composite shapes now (a bed with headboard/pillow/throw, a
    // wardrobe with door panels, a proper dining set, a kitchen counter
    // with a sink) instead of one flat labeled box - matching the actual
    // detail level in the firm's own real reference work.
    drawFurniturePiece(
      ctx,
      proj,
      { type: it.type, x: it.rx, y: it.ry, w: it.rw, d: it.rd },
      it.color,
      it.rh
    );

    const centerTop = proj(it.rx + it.rw / 2, it.ry + it.rd / 2, it.rh);
    ctx.fillStyle = "#242424";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(it.label, centerTop.x, centerTop.y - 6);
  }
  ctx.textAlign = "left";
}

export function FurnitureLayoutTool({ remainingToday }: { remainingToday: number }) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageDataRef = useRef<{ base64: string; mediaType: string } | null>(null);
  const generationIdRef = useRef<string | null>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [roomsDetected, setRoomsDetected] = useState<string[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string>("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(remainingToday);

  async function fileToBase64Image(file: File): Promise<{ base64: string; mediaType: string }> {
    if (file.type === "application/pdf") {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
      const page = await doc.getPage(1);
      // Same adaptive cap as Top View: an unusually large-format PDF
      // export otherwise produces an image well past safe browser/API
      // limits, failing with no useful error.
      const nativeViewport = page.getViewport({ scale: 1 });
      const MAX_DIMENSION = 2200;
      const nativeMaxDim = Math.max(nativeViewport.width, nativeViewport.height);
      const scale = Math.min(2, MAX_DIMENSION / nativeMaxDim);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      return { base64: dataUrl.split(",")[1], mediaType: "image/jpeg" };
    }
    const dataUrl: string = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
    return { base64: dataUrl.split(",")[1], mediaType: file.type || "image/jpeg" };
  }

  async function handleFile(file: File) {
    setMessage(null);
    setOutputUrl(null);
    setLayout(null);

    if (remaining <= 0) {
      setStage("error");
      setMessage("You've used all 5 Furniture Layout generations for today — this resets tomorrow.");
      return;
    }

    setStage("reading");
    try {
      imageDataRef.current = await fileToBase64Image(file);
    } catch {
      setStage("error");
      setMessage("Couldn't read this file. Try a PDF, JPG, or PNG.");
      return;
    }

    setStage("studying");
    try {
      const resp = await fetch("/api/isometric/furniture-layout/study", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(imageDataRef.current),
      });
      const result = await resp.json();

      if (!resp.ok || result.error) {
        setStage("error");
        setMessage(result.error ?? "Something went wrong studying this image.");
        return;
      }

      setRoomsDetected(result.rooms_detected ?? ["Room"]);
      generationIdRef.current = result.generationId ?? null;
      const rooms: string[] = result.rooms_detected ?? ["Room"];
      if (rooms.length === 1) setSelectedRoom(rooms[0]);

      if (rooms.length !== 1 || (result.questions ?? []).length > 0) {
        setQuestions(result.questions ?? []);
        setAnswers(new Array((result.questions ?? []).length).fill(""));
        setStage("answering");
      } else {
        await runGenerate(rooms[0], []);
      }
    } catch (err) {
      setStage("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong studying this image.");
    }
  }

  async function runGenerate(roomLabel: string, qas: QA[]) {
    setStage("generating");
    setMessage(null);
    try {
      const resp = await fetch("/api/isometric/furniture-layout/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...imageDataRef.current,
          roomLabel,
          questionsAndAnswers: qas,
          generationId: generationIdRef.current,
        }),
      });
      const result = await resp.json();

      if (!resp.ok || result.error) {
        setStage("error");
        setMessage(result.error ?? "Something went wrong generating this layout.");
        return;
      }

      setLayout(result.layout);
      setStage("ready");
    } catch (err) {
      setStage("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong generating this layout.");
    }
  }

  async function handleGenerate() {
    if (!layout || !canvasRef.current) return;
    setStage("rendering");
    setMessage(null);

    try {
      drawSketchupLayout(canvasRef.current, layout);

      const blob: Blob | null = await new Promise((resolve) =>
        canvasRef.current!.toBlob((b) => resolve(b), "image/jpeg", 0.95)
      );
      if (!blob) throw new Error("Could not convert the rendered layout to an image.");

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("You've been signed out — please log in again.");

      const genId = generationIdRef.current;
      if (!genId) throw new Error("Missing generation reservation — please start over.");
      const outputPath = `${user.id}/${genId}/output.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("isometric-files")
        .upload(outputPath, blob, { contentType: "image/jpeg" });
      if (uploadError) throw new Error(uploadError.message);

      const { error: updateError } = await supabase
        .from("isometric_generations")
        .update({ input_storage_path: outputPath, output_storage_path: outputPath, status: "done" })
        .eq("id", genId)
        .eq("user_id", user.id);
      if (updateError) throw new Error(updateError.message);

      const { data: signedUrlData } = await supabase.storage
        .from("isometric-files")
        .createSignedUrl(outputPath, 3600);

      setOutputUrl(signedUrlData?.signedUrl ?? null);
      setRemaining((r) => Math.max(0, r - 1));
      setStage("done");
    } catch (err) {
      setStage("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong while generating the output.");
    }
  }

  return (
    <div className="mt-6">
      <p className="mb-3 text-xs text-[var(--adrith-dim-2)]">
        {remaining} of 5 generations left today
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {(stage === "idle" || stage === "done" || stage === "error") && (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={remaining <= 0}
          className="w-full rounded-lg border border-[var(--adrith-rust)] py-3 text-sm text-[var(--adrith-rust)] disabled:opacity-50"
        >
          Upload PDF, room photo, or 3D plan photo — any room
        </button>
      )}

      {stage === "reading" && <p className="mt-3 text-sm">Reading the file…</p>}
      {stage === "studying" && <p className="mt-3 text-sm">Studying the space…</p>}
      {stage === "generating" && <p className="mt-3 text-sm">Working out an arrangement…</p>}
      {stage === "rendering" && <p className="mt-3 text-sm">Drawing the layout…</p>}
      {stage === "error" && message && <p className="mt-3 text-sm text-red-400">{message}</p>}

      {stage === "answering" && (
        <div className="mt-3 rounded-lg border border-[var(--adrith-rust)] p-3">
          {roomsDetected.length > 1 && (
            <div className="mb-3">
              <p className="mb-2 text-xs uppercase tracking-wider text-[var(--adrith-rust)]">
                This shows more than one room — which one should be furnished?
              </p>
              <div className="flex flex-wrap gap-2">
                {roomsDetected.map((r) => (
                  <button
                    key={r}
                    onClick={() => setSelectedRoom(r)}
                    className={`rounded-lg border px-3 py-1.5 text-xs ${
                      selectedRoom === r ? "border-[var(--adrith-rust)] text-[var(--adrith-rust)]" : "border-white/20"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {questions.map((q, i) => (
            <div key={i} className="mb-3">
              <p className="mb-1 text-sm">{q}</p>
              <input
                value={answers[i]}
                onChange={(e) => {
                  const next = [...answers];
                  next[i] = e.target.value;
                  setAnswers(next);
                }}
                placeholder="Your answer (optional)"
                className="w-full rounded-lg border border-white/20 bg-[var(--adrith-card)] px-3 py-2 text-sm outline-none"
              />
            </div>
          ))}
          <button
            onClick={() =>
              runGenerate(
                selectedRoom,
                questions.map((q, i) => ({ question: q, answer: answers[i] }))
              )
            }
            disabled={roomsDetected.length > 1 && !selectedRoom}
            className="mt-1 w-full rounded-lg bg-[var(--adrith-rust)] py-2.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}

      {stage === "ready" && layout && (
        <div className="mt-3 rounded-lg border border-white/20 p-3">
          <p className="text-sm font-semibold">{layout.room_label}</p>
          <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">{layout.notes}</p>
          <button
            onClick={handleGenerate}
            className="mt-3 w-full rounded-lg bg-[var(--adrith-rust)] py-3 text-sm font-semibold text-black"
          >
            Generate 3D layout
          </button>
        </div>
      )}

      {stage === "done" && outputUrl && (
        <div className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={outputUrl}
            alt="Suggested furniture layout"
            className="w-full rounded-lg border border-white/20 bg-white"
          />
          <button
            onClick={async () => {
              const resp = await fetch(outputUrl);
              const blob = await resp.blob();
              const blobUrl = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = blobUrl;
              a.download = "furniture-layout.jpg";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(blobUrl);
            }}
            className="mt-2 block w-full text-center text-xs text-[var(--adrith-rust)]"
          >
            Download
          </button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
