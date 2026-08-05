"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  makeProjector,
  drawPoly,
  drawGroundShadow,
  drawWallSegment,
  trimWallSegment,
  DEFAULT_WALL_T_FT,
  DEFAULT_WALL_H_FT,
  type Opening,
  type WallSegment,
} from "@/lib/isometric-render";

type RawWall = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  inward: { x: number; y: number };
  opening?: Opening;
};
type RoomLabel = { label: string; x: number; y: number };
type FloorPlan = {
  floor_label: string;
  overall_width_ft: number;
  overall_depth_ft: number;
  wall_height_ft: number;
  walls: RawWall[];
  room_labels: RoomLabel[];
  notes: string;
};
type QA = { question: string; answer: string };

type Stage =
  | "idle"
  | "reading"
  | "rejected"
  | "studying"
  | "clarifying"
  | "generating"
  | "ready"
  | "rendering"
  | "done"
  | "error";

const CANVAS_SIZE = 1000;

/**
 * Renders the floor plan directly in real feet, using the exact
 * technique proven correct in a real SketchUp model: real 5in wall
 * thickness, real wall height (never shortened), and the corner-
 * ownership rule - horizontal walls run their full given length;
 * vertical walls get trimmed automatically to abut cleanly, rather than
 * asking the AI to work out that arithmetic itself.
 */
function drawFloorMassing(canvas: HTMLCanvasElement, plan: FloorPlan) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const ctx: CanvasRenderingContext2D = context;
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  ctx.fillStyle = "#eef0ef";
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const W = Math.max(10, plan.overall_width_ft || 30);
  const D = Math.max(10, plan.overall_depth_ft || 30);
  const wallT = DEFAULT_WALL_T_FT;
  const h = Math.min(11, Math.max(7, plan.wall_height_ft || DEFAULT_WALL_H_FT));

  // Fit the whole footprint into the canvas at a steep, top-down angle -
  // confirmed correct by SketchUp's own "site/aerial" camera rule, since
  // this kind of footprint is always far larger than its height.
  const scale = (CANVAS_SIZE * 0.62) / Math.max(W, D);
  const heightScale = scale * 0.35;
  const offsetX = CANVAS_SIZE / 2;
  const offsetY = CANVAS_SIZE * 0.34;
  const proj = makeProjector(scale, heightScale, offsetX, offsetY);

  const base = [proj(0, 0, 0), proj(W, 0, 0), proj(W, D, 0), proj(0, D, 0)];
  drawGroundShadow(ctx, base);
  drawPoly(ctx, base, "#d8cdb8");

  const TONE_OUTER = "#f7f5f1";
  const TONE_INNER = "#e5e0d8";
  const TONE_TOP = "#fbf9f6";
  const TONE_END = "#d8d0c4";

  const segments: WallSegment[] = (plan.walls ?? []).map((w) => {
    const isHorizontal = Math.abs(w.ay - w.by) < Math.abs(w.ax - w.bx);
    const seg: WallSegment = {
      a: { x: w.ax, y: w.ay },
      b: { x: w.bx, y: w.by },
      thicknessDir: w.inward,
      opening: w.opening ?? null,
      orientation: isHorizontal ? "horizontal" : "vertical",
    };
    return trimWallSegment(seg, wallT);
  });

  // Back-to-front for this camera angle - segments nearer the far
  // (low x+y) corner drawn first, nearer ones drawn last.
  segments.sort((s1, s2) => s2.a.x + s2.a.y - (s1.a.x + s1.a.y));
  for (const seg of segments) {
    drawWallSegment(ctx, proj, seg, wallT, h, TONE_OUTER, TONE_INNER, TONE_TOP, TONE_END);
  }

  ctx.fillStyle = "#242424";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  for (const room of plan.room_labels ?? []) {
    const p = proj(room.x, room.y, h);
    ctx.fillText(room.label, p.x, p.y - 8);
  }
  ctx.textAlign = "left";
}

export function TopViewTool({ remainingToday }: { remainingToday: number }) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfFileRef = useRef<File | null>(null);
  const rasterImageRef = useRef<{ base64: string; mediaType: string } | null>(null);
  const generationIdRef = useRef<string | null>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [floorsDetected, setFloorsDetected] = useState<string[]>([]);
  const [selectedFloor, setSelectedFloor] = useState<string>("");
  const [customFloorName, setCustomFloorName] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [floorPlan, setFloorPlan] = useState<FloorPlan | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(remainingToday);

  async function handleFile(file: File) {
    setMessage(null);
    setOutputUrl(null);
    setFloorPlan(null);

    if (remaining <= 0) {
      setStage("rejected");
      setMessage("You've used all 5 Top View generations for today — this resets tomorrow.");
      return;
    }

    setStage("reading");

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      pdfFileRef.current = file;

      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

      let doc;
      try {
        doc = await pdfjsLib.getDocument({ data: bytes }).promise;
      } catch {
        setStage("rejected");
        setMessage("This doesn't look like a valid PDF file.");
        return;
      }

      const page = await doc.getPage(1);
      const opList = await page.getOperatorList();
      const { OPS } = pdfjsLib;

      let vectorPathOps = 0;
      for (const fn of opList.fnArray) {
        if (fn === OPS.constructPath || fn === OPS.stroke || fn === OPS.fill || fn === OPS.eoFill) {
          vectorPathOps++;
        }
      }

      // Same gate as before, unchanged: a genuine CAD-exported PDF carries
      // real vector path operations; a scan or flattened PDF carries none.
      // This still matters here - it's what guarantees a crisp, legible
      // source image for the AI to read accurately, not a blurry scan.
      if (vectorPathOps === 0) {
        setStage("rejected");
        setMessage(
          "This doesn't look like a CAD-exported PDF — it appears to be a scan or a flattened image. " +
            "Please export directly from AutoCAD (File → Export → PDF) and upload that file instead."
        );
        return;
      }

      // Rasterize once, at high resolution - this crisp image is what
      // gets sent to the AI, and it's also what gets rendered into the
      // final 3D view later. A fresh copy of the bytes here, since this
      // buffer is separate from whatever handleGenerate reads later.
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const rasterCtx = canvas.getContext("2d")!;
      await page.render({ canvasContext: rasterCtx, viewport, canvas }).promise;
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      rasterImageRef.current = { base64: dataUrl.split(",")[1], mediaType: "image/jpeg" };

      setStage("studying");
      const resp = await fetch("/api/isometric/top-view/study", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(rasterImageRef.current),
      });
      const result = await resp.json();

      if (!resp.ok || result.error) {
        setStage("error");
        setMessage(result.error ?? "Something went wrong studying this plan.");
        return;
      }

      const floors: string[] = result.floors_detected ?? [];
      generationIdRef.current = result.generationId ?? null;
      setFloorsDetected(floors);
      setQuestions(result.questions ?? []);
      setAnswers(new Array((result.questions ?? []).length).fill(""));

      if (floors.length === 1) {
        setSelectedFloor(floors[0]);
      }

      if (floors.length !== 1 || (result.questions ?? []).length > 0) {
        setStage("clarifying");
      } else {
        await runGenerate(floors[0]);
      }
    } catch (err) {
      setStage("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong reading this file.");
    }
  }

  async function runGenerate(floorLabel: string) {
    setStage("generating");
    setMessage(null);
    try {
      const qas: QA[] = questions.map((q, i) => ({ question: q, answer: answers[i] }));
      const resp = await fetch("/api/isometric/top-view/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...rasterImageRef.current,
          floorLabel,
          questionsAndAnswers: qas,
          generationId: generationIdRef.current,
        }),
      });
      const result = await resp.json();

      if (!resp.ok || result.error) {
        setStage("error");
        setMessage(result.error ?? "Something went wrong generating this floor's layout.");
        return;
      }

      setFloorPlan(result.floorPlan);
      setStage("ready");
    } catch (err) {
      setStage("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong generating this floor's layout.");
    }
  }

  async function handleGenerate() {
    if (!floorPlan || !canvasRef.current || !pdfFileRef.current) return;
    setStage("rendering");
    setMessage(null);

    try {
      drawFloorMassing(canvasRef.current, floorPlan);

      const blob: Blob | null = await new Promise((resolve) =>
        canvasRef.current!.toBlob((b) => resolve(b), "image/jpeg", 0.95)
      );
      if (!blob) throw new Error("Could not convert the rendered floor to an image.");

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("You've been signed out — please log in again.");

      const genId = generationIdRef.current;
      if (!genId) throw new Error("Missing generation reservation — please start over.");
      const inputPath = `${user.id}/${genId}/input.pdf`;
      const outputPath = `${user.id}/${genId}/output.jpg`;

      const inputBytes = new Uint8Array(await pdfFileRef.current.arrayBuffer());
      const { error: inputUploadError } = await supabase.storage
        .from("isometric-files")
        .upload(inputPath, inputBytes, { contentType: "application/pdf" });
      if (inputUploadError) throw new Error(inputUploadError.message);

      const { error: outputUploadError } = await supabase.storage
        .from("isometric-files")
        .upload(outputPath, blob, { contentType: "image/jpeg" });
      if (outputUploadError) throw new Error(outputUploadError.message);

      // Update the reservation made back at the study step, rather than
      // inserting a fresh row - that reservation is what actually
      // consumed one of today's 5 slots.
      const { error: updateError } = await supabase
        .from("isometric_generations")
        .update({ input_storage_path: inputPath, output_storage_path: outputPath, status: "done" })
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

  const finalFloorChoice = selectedFloor || customFloorName.trim() || "Floor";

  return (
    <div className="mt-6">
      <p className="mb-3 text-xs text-[var(--adrith-dim-2)]">
        {remaining} of 5 generations left today
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {(stage === "idle" || stage === "rejected" || stage === "done" || stage === "error") && (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={remaining <= 0}
          className="w-full rounded-lg border border-[var(--adrith-rust)] py-3 text-sm text-[var(--adrith-rust)] disabled:opacity-50"
        >
          Upload CAD-exported PDF
        </button>
      )}

      {stage === "reading" && <p className="mt-3 text-sm">Reading the plan…</p>}
      {stage === "studying" && <p className="mt-3 text-sm">Studying the sheet…</p>}
      {stage === "generating" && <p className="mt-3 text-sm">Working out the floor layout…</p>}
      {stage === "rendering" && <p className="mt-3 text-sm">Drawing the 3D view…</p>}
      {stage === "rejected" && message && <p className="mt-3 text-sm text-red-400">{message}</p>}
      {stage === "error" && message && <p className="mt-3 text-sm text-red-400">{message}</p>}

      {stage === "clarifying" && (
        <div className="mt-3 rounded-lg border border-[var(--adrith-rust)] p-3">
          {floorsDetected.length > 1 && (
            <div className="mb-3">
              <p className="mb-2 text-xs uppercase tracking-wider text-[var(--adrith-rust)]">
                This sheet shows more than one floor — which one?
              </p>
              <div className="flex flex-wrap gap-2">
                {floorsDetected.map((f) => (
                  <button
                    key={f}
                    onClick={() => setSelectedFloor(f)}
                    className={`rounded-lg border px-3 py-1.5 text-xs ${
                      selectedFloor === f
                        ? "border-[var(--adrith-rust)] text-[var(--adrith-rust)]"
                        : "border-white/20"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          )}

          {floorsDetected.length === 0 && (
            <div className="mb-3">
              <p className="mb-1 text-sm">What should this floor be called?</p>
              <input
                value={customFloorName}
                onChange={(e) => setCustomFloorName(e.target.value)}
                placeholder="e.g. Ground Floor"
                className="w-full rounded-lg border border-white/20 bg-[var(--adrith-card)] px-3 py-2 text-sm outline-none"
              />
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
            onClick={() => runGenerate(finalFloorChoice)}
            disabled={floorsDetected.length > 1 && !selectedFloor}
            className="mt-1 w-full rounded-lg bg-[var(--adrith-rust)] py-2.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}

      {stage === "ready" && floorPlan && (
        <div className="mt-3 rounded-lg border border-white/20 p-3">
          <p className="text-sm font-semibold">{floorPlan.floor_label}</p>
          <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">{floorPlan.notes}</p>
          <button
            onClick={handleGenerate}
            className="mt-3 w-full rounded-lg bg-[var(--adrith-rust)] py-3 text-sm font-semibold text-black"
          >
            Generate 3D view
          </button>
        </div>
      )}

      {stage === "done" && outputUrl && (
        <div className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={outputUrl}
            alt="Generated 3D floor view"
            className="w-full rounded-lg border border-white/20 bg-white"
          />
          <button
            onClick={async () => {
              // A plain <a download> unreliably ignores the download
              // attribute for cross-origin URLs like Supabase Storage -
              // most browsers just open the image instead of saving it.
              // Fetching it into a local blob URL makes the save work
              // reliably regardless of origin.
              const resp = await fetch(outputUrl);
              const blob = await resp.blob();
              const blobUrl = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = blobUrl;
              a.download = "floor-view.jpg";
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
