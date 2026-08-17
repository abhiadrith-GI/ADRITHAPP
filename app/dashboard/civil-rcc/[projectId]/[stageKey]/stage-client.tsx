"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Checkpoint, ChecklistStage, CheckpointEvidence, UserRole } from "@/types/database";
import { PageBackground } from "@/components/page-background";

type Props = {
  projectId: string;
  projectName: string;
  stage: ChecklistStage;
  checkpoints: Checkpoint[];
  evidence: CheckpointEvidence[];
  existingSignOff: { id: string; confirmation_text: string; signed_at: string; role_at_signing: UserRole } | null;
  canSignOff: boolean;
  currentUserId: string;
  currentUserRole: UserRole;
};

export default function StageClient({
  projectId,
  projectName,
  stage,
  checkpoints,
  evidence,
  existingSignOff,
  canSignOff,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [localCheckpoints, setLocalCheckpoints] = useState(checkpoints);
  const [localEvidence, setLocalEvidence] = useState(evidence);
  const [activeCamera, setActiveCamera] = useState<string | null>(null); // checkpoint id
  const [error, setError] = useState<string | null>(null);

  async function updateCheckpointStatus(id: string, status: Checkpoint["status"]) {
    setError(null);
    const { error: updateError } = await supabase
      .from("checkpoints")
      .update({ status })
      .eq("id", id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setLocalCheckpoints((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
  }

  async function handleCaptured(checkpointId: string, blob: Blob) {
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const path = `${projectId}/${checkpointId}/${crypto.randomUUID()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("checkpoint-evidence")
      .upload(path, blob, { contentType: "image/jpeg" });

    if (uploadError) {
      setError(uploadError.message);
      return;
    }

    const { data: row, error: insertError } = await supabase
      .from("checkpoint_evidence")
      .insert({ checkpoint_id: checkpointId, storage_path: path, uploaded_by: user.id })
      .select("id, checkpoint_id, storage_path, uploaded_by, uploaded_at, device_metadata, ai_precheck_status, ai_precheck_note")
      .single();

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setLocalEvidence((prev) => [...prev, row]);
    setActiveCamera(null);

    // Fire the AI precheck after the photo is already safely uploaded and
    // permanent - never blocks on this, and any failure here is caught
    // and recorded server-side without affecting the photo itself.
    const checkpointDescription = localCheckpoints.find((c) => c.id === checkpointId)?.description;
    fetch("/api/precheck", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ evidenceId: row.id, storagePath: path, checkpointDescription }),
    })
      .then((r) => r.json())
      .then((result: { status?: string; note?: string }) => {
        if (result?.status) {
          setLocalEvidence((prev) =>
            prev.map((e) =>
              e.id === row.id
                ? { ...e, ai_precheck_status: result.status as CheckpointEvidence["ai_precheck_status"], ai_precheck_note: result.note ?? null }
                : e
            )
          );
        }
      })
      .catch(() => {
        // Precheck is advisory only - a network hiccup here is not worth
        // surfacing as an error to someone who just successfully uploaded
        // a photo.
      });
  }

  const allAddressed =
    localCheckpoints.length > 0 &&
    localCheckpoints.every((c) => c.status !== "pending");

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <PageBackground src="/backgrounds/civil-rcc.jpg" />

      <div className="relative z-10 mx-auto max-w-md">
        <Link
          href={`/dashboard/civil-rcc/${projectId}`}
          className="font-mono text-xs text-[var(--adrith-dim-2)]"
        >
          ← {projectName}
        </Link>

        <h1 className="mb-6 mt-3 text-lg font-bold">{stage.display_name}</h1>

        {error && (
          <p className="mb-4 rounded-lg border border-red-500/40 px-3 py-2 text-xs text-red-400">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-4">
          {localCheckpoints.map((cp) => (
            <CheckpointCard
              key={cp.id}
              checkpoint={cp}
              evidence={localEvidence.filter((e) => e.checkpoint_id === cp.id)}
              onStatusChange={(status) => updateCheckpointStatus(cp.id, status)}
              onTakePhoto={() => setActiveCamera(cp.id)}
              onGalleryPick={(file) => handleCaptured(cp.id, file)}
              canJudge={canSignOff}
            />
          ))}
        </div>

        {activeCamera && (
          <CameraCapture
            onCapture={(blob) => handleCaptured(activeCamera, blob)}
            onClose={() => setActiveCamera(null)}
          />
        )}

        <SignOffSection
          stageId={stage.id}
          canSignOff={canSignOff}
          allAddressed={allAddressed}
          existingSignOff={existingSignOff}
          onSigned={() => router.refresh()}
        />
      </div>
    </main>
  );
}

function CheckpointCard({
  checkpoint,
  evidence,
  onStatusChange,
  onTakePhoto,
  onGalleryPick,
  canJudge,
}: {
  checkpoint: Checkpoint;
  evidence: CheckpointEvidence[];
  onStatusChange: (status: Checkpoint["status"]) => void;
  onTakePhoto: () => void;
  onGalleryPick: (file: File) => void;
  /** Only this project's designer (or admin) can mark Pass/Fail/Flag — everyone else can still attach photos. */
  canJudge: boolean;
}) {
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const atPhotoLimit = evidence.length >= 2;

  return (
    <div className="rounded-xl border border-white/20 bg-[var(--adrith-card)] p-4">
      <p className="text-sm">{checkpoint.description}</p>
      {checkpoint.standard_reference && (
        <p className="mt-1 font-mono text-[10px] text-[var(--adrith-dim-2)]">
          {checkpoint.standard_reference}
        </p>
      )}

      {evidence.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {evidence.map((e) => (
            <div key={e.id} className="flex gap-2">
              <EvidenceThumb storagePath={e.storage_path} />
              {e.ai_precheck_status === "done" && e.ai_precheck_note && (
                <p className="flex-1 self-center text-[11px] text-[var(--adrith-dim-2)]">
                  🤖 {e.ai_precheck_note}
                </p>
              )}
              {e.ai_precheck_status === "pending" && (
                <p className="flex-1 self-center text-[11px] text-[var(--adrith-dim-2)]">
                  🤖 Checking photo…
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onGalleryPick(file);
          e.target.value = "";
        }}
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {atPhotoLimit ? (
          <p className="text-[11px] text-[var(--adrith-dim-2)]">
            2 photos already attached — the limit per checkpoint.
          </p>
        ) : (
          <>
            <button
              onClick={onTakePhoto}
              className="rounded-lg border border-[var(--adrith-rust)] px-3 py-1.5 text-xs text-[var(--adrith-rust)]"
            >
              📷 Take Photo
            </button>
            <button
              onClick={() => galleryInputRef.current?.click()}
              className="rounded-lg border border-white/25 px-3 py-1.5 text-xs text-[var(--adrith-off-white)]"
            >
              🖼️ Choose from Gallery
            </button>
          </>
        )}
        {canJudge && (
          <>
            <StatusButton
              label="Pass"
              active={checkpoint.status === "pass"}
              onClick={() => onStatusChange("pass")}
            />
            <StatusButton
              label="Fail"
              active={checkpoint.status === "fail"}
              onClick={() => onStatusChange("fail")}
            />
            <StatusButton
              label="Flag"
              active={checkpoint.status === "flagged"}
              onClick={() => onStatusChange("flagged")}
            />
          </>
        )}
      </div>
      {!canJudge && (
        <p className="mt-2 text-[11px] text-[var(--adrith-dim-2)]">
          Only this project&apos;s designer can mark Pass, Fail, or Flag.
        </p>
      )}
    </div>
  );
}

function StatusButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs ${
        active ? "border-white bg-white text-black" : "border-white/25 text-[var(--adrith-off-white)]"
      }`}
    >
      {label}
    </button>
  );
}

function EvidenceThumb({ storagePath }: { storagePath: string }) {
  const supabase = createClient();
  const [url, setUrl] = useState<string | null>(null);

  useState(() => {
    supabase.storage
      .from("checkpoint-evidence")
      .createSignedUrl(storagePath, 3600)
      .then(({ data }) => setUrl(data?.signedUrl ?? null));
  });

  if (!url) {
    return <div className="h-14 w-14 shrink-0 rounded-md bg-white/10" />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Checkpoint evidence" className="h-14 w-14 shrink-0 rounded-md object-cover" />;
}

/**
 * Live camera capture via getUserMedia, pointed at the rear camera to
 * match real site-photo use. Gallery upload now exists too (see
 * CheckpointCard's "Choose from Gallery" button) as a separate, deliberate
 * option alongside this one, not merged into it - opening the gallery no
 * longer guarantees a photo was taken right now, so this live-capture path
 * stays available for anyone who wants that guarantee for their own record.
 */
function CameraCapture({
  onCapture,
  onClose,
}: {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  async function startCamera(node: HTMLVideoElement | null) {
    if (!node || streamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      node.srcObject = stream;
      await node.play();
      setReady(true);
    } catch {
      setPermissionError(
        "Camera access was blocked or isn't available. Check your browser's camera permission for this site."
      );
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(blob);
        stopCamera();
      },
      "image/jpeg",
      0.9
    );
  }

  function handleClose() {
    stopCamera();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {permissionError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-sm text-[var(--adrith-dim-2)]">{permissionError}</p>
          <button
            onClick={handleClose}
            className="rounded-lg border border-white/25 px-4 py-2 text-sm"
          >
            Close
          </button>
        </div>
      ) : (
        <>
          <video
            ref={(node) => {
              videoRef.current = node;
              startCamera(node);
            }}
            className="flex-1 object-cover"
            playsInline
            muted
          />
          <div className="flex items-center justify-between bg-black px-8 py-6">
            <button onClick={handleClose} className="text-sm text-[var(--adrith-dim-2)]">
              Cancel
            </button>
            <button
              onClick={capture}
              disabled={!ready}
              className="h-16 w-16 rounded-full border-4 border-white bg-[var(--adrith-rust)] disabled:opacity-40"
              aria-label="Capture photo"
            />
            <span className="w-10" />
          </div>
        </>
      )}
    </div>
  );
}

function SignOffSection({
  stageId,
  canSignOff,
  allAddressed,
  existingSignOff,
  onSigned,
}: {
  stageId: string;
  canSignOff: boolean;
  allAddressed: boolean;
  existingSignOff: { confirmation_text: string; signed_at: string; role_at_signing: UserRole } | null;
  onSigned: () => void;
}) {
  const supabase = createClient();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (existingSignOff) {
    return (
      <div className="mt-8 rounded-xl border border-[var(--adrith-rust)]/50 bg-[var(--adrith-card)] p-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--adrith-rust)]">
          Signed Off
        </p>
        <p className="mt-2 text-sm">{existingSignOff.confirmation_text}</p>
        <p className="mt-2 text-xs text-[var(--adrith-dim-2)]">
          {new Date(existingSignOff.signed_at).toLocaleString()} ·{" "}
          <span className="capitalize">{existingSignOff.role_at_signing}</span>
        </p>
      </div>
    );
  }

  if (!canSignOff) return null;

  async function handleSignOff() {
    setError(null);
    if (text.trim().length < 10) {
      setError("Write a real confirmation statement, not just a word or two.");
      return;
    }
    setSubmitting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const { error: signError } = await supabase.from("sign_offs").insert({
      stage_id: stageId,
      user_id: user.id,
      role_at_signing: profile?.role ?? "engineer",
      confirmation_text: text.trim(),
    });

    if (signError) {
      setError(signError.message);
      setSubmitting(false);
      return;
    }

    onSigned();
  }

  return (
    <div className="mt-8 rounded-xl border border-white/20 bg-[var(--adrith-card)] p-4">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">
        Sign Off This Stage
      </p>
      {!allAddressed && (
        <p className="mb-2 text-xs text-[var(--adrith-dim-2)]">
          Every checkpoint should be marked before signing off — you can still
          proceed if something is deliberately left flagged.
        </p>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="I confirm this stage has been reviewed and meets the required standard…"
        className="w-full rounded-lg border border-white/20 bg-black px-3 py-2 text-sm outline-none"
        rows={3}
      />
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      <button
        onClick={handleSignOff}
        disabled={submitting}
        className="mt-3 w-full rounded-lg bg-[var(--adrith-rust)] px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
      >
        {submitting ? "Signing off…" : "Confirm & Sign Off"}
      </button>
      <p className="mt-2 text-[10px] text-[var(--adrith-dim-2)]">
        This becomes a permanent record and can never be edited once submitted.
      </p>
    </div>
  );
}
