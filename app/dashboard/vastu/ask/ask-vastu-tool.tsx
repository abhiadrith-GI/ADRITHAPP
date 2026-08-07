"use client";

import { useState, useRef } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  imagePreviewUrl?: string;
};

type PendingImage = {
  base64: string;
  mediaType: string;
  previewUrl: string;
};

function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve({ base64, mediaType: file.type });
    };
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

export function AskVastuTool() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEscalation, setShowEscalation] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { base64, mediaType } = await fileToBase64(file);
      setPendingImage({ base64, mediaType, previewUrl: URL.createObjectURL(file) });
    } catch {
      setError("Could not read that photo — try a different one.");
    }
    e.target.value = "";
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || isLoading) return;

    setError(null);
    setIsLoading(true);
    const outgoingImage = pendingImage;
    setMessages((prev) => [...prev, { role: "user", content: text, imagePreviewUrl: outgoingImage?.previewUrl }]);
    setInput("");
    setPendingImage(null);

    try {
      const res = await fetch("/api/vastu/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId,
          message: text,
          imageBase64: outgoingImage?.base64 ?? null,
          imageMediaType: outgoingImage?.mediaType ?? null,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        if (data.conversationId) setConversationId(data.conversationId);
        setIsLoading(false);
        return;
      }

      setConversationId(data.conversationId);
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      setShowEscalation(Boolean(data.showEscalationPrompt));
    } catch {
      setError("Could not reach the server — check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mt-6 flex flex-col">
      {messages.length === 0 && (
        <p className="rounded-xl border border-white/15 bg-[var(--adrith-card)] p-4 text-sm leading-relaxed text-[var(--adrith-dim-2)]">
          Ask anything about Vastu for your home — a room&apos;s placement, a
          material choice, a remedy for something that isn&apos;t ideal.
          Answers here are for awareness only, based on general Vastu
          guidance — not a guarantee, and not a replacement for formal
          consultation before any change is made.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-xl p-3 text-sm leading-relaxed ${
              m.role === "user"
                ? "self-end bg-[var(--adrith-rust)] text-black"
                : "self-start border border-white/15 bg-[var(--adrith-card)]"
            }`}
          >
            {m.imagePreviewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.imagePreviewUrl} alt="Uploaded" className="mb-2 max-h-40 rounded-lg" />
            )}
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
        {isLoading && (
          <div className="self-start rounded-xl border border-white/15 bg-[var(--adrith-card)] p-3 text-sm text-[var(--adrith-dim-2)]">
            Thinking…
          </div>
        )}
      </div>

      {showEscalation && (
        <a
          href="tel:+917259850990"
          className="mt-4 rounded-xl border border-[var(--adrith-rust)] p-4"
        >
          <p className="text-sm font-semibold text-[var(--adrith-rust)]">
            Still not fully resolved?
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--adrith-dim-2)]">
            This has gone a few rounds without a clear answer — for something
            this specific to your home, talk to us directly instead of
            continuing to guess here.
          </p>
        </a>
      )}

      {error && <p className="mt-3 text-xs text-[var(--adrith-rust)]">{error}</p>}

      {pendingImage && (
        <div className="mt-3 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pendingImage.previewUrl} alt="Attached" className="h-12 w-12 rounded-lg object-cover" />
          <button onClick={() => setPendingImage(null)} className="text-xs text-[var(--adrith-dim-2)] underline">
            Remove photo
          </button>
        </div>
      )}

      <div className="sticky bottom-4 mt-4 flex items-end gap-2 rounded-xl border border-white/15 bg-[var(--adrith-card)] p-2">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="rounded-lg border border-white/20 p-2.5 text-sm"
          aria-label="Attach a photo"
        >
          📷
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Ask a question…"
          rows={1}
          className="flex-1 resize-none bg-transparent p-2 text-sm outline-none"
        />
        <button
          onClick={sendMessage}
          disabled={isLoading || !input.trim()}
          className="rounded-lg bg-[var(--adrith-rust)] px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
