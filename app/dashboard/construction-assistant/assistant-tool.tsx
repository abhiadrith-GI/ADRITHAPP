"use client";

import { useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "What is the minimum clear cover for slab reinforcement?",
  "How do I check if the concrete mix on site is good?",
  "ಮನೆ ಕಟ್ಟಲು ಯಾವ ಇಟ್ಟಿಗೆ ಉತ್ತಮ?",
  "What documents are needed to build a house in a Karnataka town?",
];

export function ConstructionAssistantTool({ dailyLimit, usedToday }: { dailyLimit: number; usedToday: number }) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [used, setUsed] = useState(usedToday);

  const left = Math.max(0, dailyLimit - used);

  async function send(text: string) {
    const question = text.trim();
    if (!question || isLoading) return;

    setError(null);
    setIsLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");

    try {
      const res = await fetch("/api/construction-assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, message: question }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        if (data.conversationId) setConversationId(data.conversationId);
        if (res.status === 429) setUsed(dailyLimit);
        // Take the unanswered question back out of the chat so it can be retried.
        setMessages((prev) => prev.slice(0, -1));
        setInput(question);
        return;
      }

      setConversationId(data.conversationId);
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      setUsed((n) => n + 1);
    } catch {
      setError("Could not reach the server — check your connection and try again.");
      setMessages((prev) => prev.slice(0, -1));
      setInput(question);
    } finally {
      setIsLoading(false);
    }
  }

  function newChat() {
    setConversationId(null);
    setMessages([]);
    setError(null);
  }

  return (
    <div className="mt-6 flex flex-col">
      {messages.length === 0 && (
        <>
          <p className="rounded-xl border border-white/15 bg-[var(--adrith-card)] p-4 text-sm leading-relaxed text-[var(--adrith-dim-2)]">
            Guidance only — I can&apos;t see your site and I&apos;m not a licensed engineer. For anything structural
            (cracks, loads, removing walls, adding floors) a qualified engineer must inspect it. Prices and local rules
            vary, so confirm them locally.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={isLoading || left === 0}
                className="rounded-xl border border-white/15 px-3 py-2.5 text-left text-xs text-[var(--adrith-off-white)] disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mt-3 flex flex-col gap-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[88%] rounded-xl p-3 text-sm leading-relaxed ${
              m.role === "user"
                ? "self-end bg-[var(--adrith-rust)] text-black"
                : "self-start border border-white/15 bg-[var(--adrith-card)]"
            }`}
          >
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
        {isLoading && (
          <div className="self-start rounded-xl border border-white/15 bg-[var(--adrith-card)] p-3 text-sm text-[var(--adrith-dim-2)]">
            Thinking…
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-xs text-[var(--adrith-rust)]">{error}</p>}

      <div className="mt-4 flex items-center justify-between text-[11px] text-[var(--adrith-dim-2)]">
        <span>
          {left} of {dailyLimit} free questions left today
        </span>
        {messages.length > 0 && (
          <button onClick={newChat} className="underline">
            New chat
          </button>
        )}
      </div>

      <div className="sticky bottom-4 mt-2 flex items-end gap-2 rounded-xl border border-white/15 bg-[var(--adrith-card)] p-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, 2000))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder={left === 0 ? "Daily limit reached — back tomorrow" : "Ask a construction question…"}
          disabled={left === 0}
          rows={1}
          className="flex-1 resize-none bg-transparent p-2 text-sm outline-none"
        />
        <button
          onClick={() => send(input)}
          disabled={isLoading || !input.trim() || left === 0}
          className="rounded-lg bg-[var(--adrith-rust)] px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40"
        >
          Send
        </button>
      </div>

      <a href="tel:+917259850990" className="mt-4 text-center text-xs text-[var(--adrith-dim-2)] underline">
        Need a professional opinion? Talk to the Adrith team
      </a>
    </div>
  );
}
