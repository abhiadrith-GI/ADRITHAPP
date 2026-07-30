"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type Stage =
  | "idle"
  | "reading"
  | "rejected"
  | "checking"
  | "needs_clarification"
  | "ready_to_generate"
  | "generating"
  | "done"
  | "error";

export function TopViewTool({ remainingToday }: { remainingToday: number }) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfFileRef = useRef<File | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [clarifyingQuestions, setClarifyingQuestions] = useState<string[]>([]);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(remainingToday);

  async function handleFile(file: File) {
    setMessage(null);
    setOutputUrl(null);

    if (remaining <= 0) {
      setStage("rejected");
      setMessage("You've used all 5 Top View generations for today — this resets tomorrow.");
      return;
    }

    setStage("reading");

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      pdfFileRef.current = file;

      // Loaded dynamically - pdfjs-dist is a genuinely large library, no
      // reason to add it to every page's initial bundle when only this one
      // tool needs it.
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

      const textContent = await page.getTextContent();

      // The actual condition, confirmed against real test files: a genuine
      // CAD-exported PDF carries real vector path operations. A scanned or
      // flattened PDF is just one embedded raster image wrapped in a PDF
      // shell - zero vector paths, no real extractable text either.
      if (vectorPathOps === 0) {
        setStage("rejected");
        setMessage(
          "This doesn't look like a CAD-exported PDF — it appears to be a scan or a flattened image. " +
            "Please export directly from AutoCAD (File → Export → PDF) and upload that file instead."
        );
        return;
      }

      setStage("checking");

      const textSummary = textContent.items
        .map((it) => ("str" in it ? it.str : ""))
        .filter(Boolean)
        .join(" ");

      const resp = await fetch("/api/isometric/top-view/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ textSummary, vectorPathOps, textItemCount: textContent.items.length }),
      });
      const result = await resp.json();

      if (result.questions?.length) {
        setClarifyingQuestions(result.questions);
        setStage("needs_clarification");
      } else {
        setStage("ready_to_generate");
      }
    } catch (err) {
      setStage("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong reading this file.");
    }
  }

  async function handleGenerate() {
    if (!pdfFileRef.current) return;
    setStage("generating");
    setMessage(null);

    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

      // A fresh, never-before-transferred copy for this specific call -
      // reusing the same buffer across two getDocument() calls is exactly
      // what caused the "ArrayBuffer is detached" failure. Each worker
      // hand-off gets its own copy from here on.
      const renderBytes = new Uint8Array(await pdfFileRef.current.arrayBuffer());
      const doc = await pdfjsLib.getDocument({ data: renderBytes }).promise;
      const page = await doc.getPage(1);

      // High scale for a genuinely crisp result - this direct render is
      // what makes the output exact: no reconstruction from parsed
      // primitives, just a faithful rasterization of what's already there.
      const viewport = page.getViewport({ scale: 3 });
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Could not prepare the canvas for rendering.");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not prepare the canvas for rendering.");

      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.95)
      );
      if (!blob) throw new Error("Could not convert the rendered page to an image.");

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("You've been signed out — please log in again.");

      const genId = crypto.randomUUID();
      const inputPath = `${user.id}/${genId}/input.pdf`;
      const outputPath = `${user.id}/${genId}/output.jpg`;

      // Another fresh copy, specifically for the upload - the one above
      // was already handed to the PDF worker and can't be reused either.
      const uploadBytes = new Uint8Array(await pdfFileRef.current.arrayBuffer());
      const { error: inputUploadError } = await supabase.storage
        .from("isometric-files")
        .upload(inputPath, uploadBytes, { contentType: "application/pdf" });
      if (inputUploadError) throw new Error(inputUploadError.message);

      const { error: outputUploadError } = await supabase.storage
        .from("isometric-files")
        .upload(outputPath, blob, { contentType: "image/jpeg" });
      if (outputUploadError) throw new Error(outputUploadError.message);

      const { error: insertError } = await supabase.from("isometric_generations").insert({
        id: genId,
        user_id: user.id,
        base: "top_view",
        input_storage_path: inputPath,
        output_storage_path: outputPath,
        status: "done",
      });
      if (insertError) throw new Error(insertError.message);

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

      {stage === "reading" && <p className="mt-3 text-sm">Reading the file…</p>}
      {stage === "checking" && <p className="mt-3 text-sm">Checking the plan…</p>}

      {stage === "rejected" && message && (
        <p className="mt-3 text-sm text-red-400">{message}</p>
      )}
      {stage === "error" && message && <p className="mt-3 text-sm text-red-400">{message}</p>}

      {stage === "needs_clarification" && (
        <div className="mt-3 rounded-lg border border-[var(--adrith-rust)] p-3">
          <p className="mb-2 text-xs uppercase tracking-wider text-[var(--adrith-rust)]">
            Before generating
          </p>
          <ul className="mb-3 list-disc pl-4 text-sm">
            {clarifyingQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
          <button
            onClick={() => setStage("ready_to_generate")}
            className="w-full rounded-lg border border-white/25 py-2 text-sm"
          >
            I&apos;ve reviewed this — continue anyway
          </button>
        </div>
      )}

      {stage === "ready_to_generate" && (
        <button
          onClick={handleGenerate}
          className="mt-3 w-full rounded-lg bg-[var(--adrith-rust)] py-3 text-sm font-semibold text-black"
        >
          Generate exact top view
        </button>
      )}

      {stage === "generating" && <p className="mt-3 text-sm">Generating…</p>}

      {stage === "done" && outputUrl && (
        <div className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={outputUrl} alt="Generated top view" className="w-full rounded-lg border border-white/20" />
          <a
            href={outputUrl}
            download="top-view.jpg"
            className="mt-2 block text-center text-xs text-[var(--adrith-rust)]"
          >
            Download
          </a>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
