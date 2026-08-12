import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildMaterialSystemPrompt } from "@/lib/materials/grounding";
import type { MaterialAnalysisResult } from "@/lib/materials/types";

type ConversationTurn = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  const {
    projectId,
    trade,
    roomType,
    imageBase64,
    imageMediaType,
    description,
    conversationHistory,
  }: {
    projectId: string;
    trade: "plumbing" | "electrical";
    roomType: string;
    imageBase64?: string;
    imageMediaType?: string;
    description?: string;
    conversationHistory?: ConversationTurn[];
  } = await req.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this project." }, { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI analysis is not configured yet." }, { status: 503 });
  }

  // Log the attempt BEFORE the AI call - this is what the rate-limit
  // trigger checks, so a call that's about to fail the daily cap never
  // reaches the AI at all.
  const { error: attemptError } = await supabase.from("material_analysis_attempts").insert({ user_id: user.id });
  if (attemptError) {
    const limitHit = attemptError.message?.includes("Daily material analysis limit");
    return NextResponse.json(
      { error: limitHit ? "Daily analysis limit reached — please try again tomorrow." : "Could not start analysis." },
      { status: limitHit ? 429 : 500 }
    );
  }

  const history: ConversationTurn[] = conversationHistory ?? [];
  const isFirstTurn = history.length === 0;

  const anthropicMessages = isFirstTurn
    ? [
        {
          role: "user",
          content: imageBase64 && imageMediaType
            ? [
                { type: "image", source: { type: "base64", media_type: imageMediaType, data: imageBase64 } },
                { type: "text", text: description?.trim() || "Please analyze this for materials needed." },
              ]
            : description?.trim() || "Please analyze this room for materials needed.",
        },
      ]
    : [...history.map((h) => ({ role: h.role, content: h.content })), ...(description?.trim() ? [{ role: "user" as const, content: description.trim() }] : [])];

  try {
    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        // Was 1500 - a genuinely thorough room (WC + wash basin + shower,
        // each with hot/cold supply and their own components) needs 20+
        // material line items, which lands at or past that ceiling.
        max_tokens: 4000,
        system: buildMaterialSystemPrompt(trade, roomType),
        messages: anthropicMessages,
        stream: true,
      }),
    });

    if (!aiResp.ok || !aiResp.body) {
      let detail = "";
      try {
        const errBody = await aiResp.json();
        detail = errBody?.error?.message ?? "";
      } catch {}
      return NextResponse.json({ error: `AI request failed (${aiResp.status}).${detail ? " " + detail : ""}` }, { status: 502 });
    }

    // A non-streaming call sits silent on the connection for the AI's
    // entire generation time before sending anything back. Once a
    // genuinely thorough room started needing 20+ line items, that
    // silence started landing past Netlify's function timeout (10s free
    // / 26s paid) - the connection gets killed mid-request, which the
    // browser reports as "Could not reach the server," not as an error
    // response, because no response ever arrived to report. Streaming
    // keeps bytes actively flowing the whole time instead, which is
    // Netlify's own documented way to avoid exactly this.
    //
    // The heartbeat runs independently of Anthropic's own output pace -
    // it's not just long generation that's a risk, a slow time-to-first-
    // token before any content arrives at all would leave the same kind
    // of silent gap otherwise.
    const encoder = new TextEncoder();
    const outStream = new ReadableStream({
      async start(controller) {
        function sendLine(obj: unknown) {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        }

        const heartbeat = setInterval(() => sendLine({ type: "progress" }), 4000);

        const reader = aiResp.body!.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = "";
        let accumulatedText = "";
        let finalStopReason: string | null = null;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            sseBuffer += decoder.decode(value, { stream: true });

            const lines = sseBuffer.split("\n");
            sseBuffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice("data: ".length).trim();
              if (!jsonStr) continue;

              let evt: { type?: string; delta?: { type?: string; text?: string; stop_reason?: string } };
              try {
                evt = JSON.parse(jsonStr);
              } catch {
                continue; // malformed SSE framing shouldn't kill the whole stream
              }

              if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta" && evt.delta.text) {
                accumulatedText += evt.delta.text;
                sendLine({ type: "progress" });
              } else if (evt.type === "message_delta" && evt.delta?.stop_reason) {
                finalStopReason = evt.delta.stop_reason;
              }
            }
          }
        } catch (streamErr) {
          clearInterval(heartbeat);
          console.error("[materials/analyze] error reading AI stream", {
            roomType,
            trade,
            isFirstTurn,
            message: streamErr instanceof Error ? streamErr.message : String(streamErr),
          });
          sendLine({ type: "error", error: "Lost connection to the AI mid-response — please try again." });
          controller.close();
          return;
        }

        clearInterval(heartbeat);

        // Same checks as before - a truncated response is still detected
        // the same way, JSON is still extracted the same way. Only the
        // fact that the text arrived progressively, and that the outcome
        // is now the last line of the stream instead of the only
        // response, has changed.
        if (finalStopReason === "max_tokens") {
          console.error("[materials/analyze] hit max_tokens ceiling, response truncated", {
            roomType,
            trade,
            isFirstTurn,
            rawTextLength: accumulatedText.length,
          });
          sendLine({ type: "error", error: "That request needs a longer response than expected — try fewer fixtures at once, or try again." });
          controller.close();
          return;
        }

        let parsed: MaterialAnalysisResult;
        try {
          const withoutFences = accumulatedText.replace(/```json|```/g, "").trim();
          const firstBrace = withoutFences.indexOf("{");
          const lastBrace = withoutFences.lastIndexOf("}");
          const cleaned =
            firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace
              ? withoutFences.slice(firstBrace, lastBrace + 1)
              : withoutFences;
          parsed = JSON.parse(cleaned);
        } catch (parseErr) {
          console.error("[materials/analyze] JSON parse failed", {
            roomType,
            trade,
            isFirstTurn,
            stopReason: finalStopReason,
            rawTextLength: accumulatedText.length,
            rawTextSnippet: accumulatedText.slice(0, 300),
            parseErrorMessage: parseErr instanceof Error ? parseErr.message : String(parseErr),
          });
          sendLine({ type: "error", error: "Could not read the AI's response — please try again." });
          controller.close();
          return;
        }

        const newHistory: ConversationTurn[] = [
          ...anthropicMessages.map((m) => ({ role: m.role as "user" | "assistant", content: typeof m.content === "string" ? m.content : "[image + text]" })),
          { role: "assistant", content: accumulatedText },
        ];

        if (parsed.type === "clarifying_question") {
          sendLine({ type: "result", payload: { type: "clarifying_question", question: parsed.question, conversationHistory: newHistory } });
          controller.close();
          return;
        }

        // A real materials answer - save it as a new draft list.
        let sourceStoragePath: string | null = null;
        if (imageBase64 && imageMediaType) {
          const ext = imageMediaType === "image/png" ? "png" : "jpg";
          const path = `${projectId}/${crypto.randomUUID()}.${ext}`;
          const bytes = Buffer.from(imageBase64, "base64");
          const { error: uploadError } = await supabase.storage.from("material-list-files").upload(path, bytes, { contentType: imageMediaType });
          if (!uploadError) sourceStoragePath = path;
        }

        const { data: list, error: insertError } = await supabase
          .from("material_lists")
          .insert({
            project_id: projectId,
            created_by: user.id,
            trade,
            room_type: roomType,
            items: parsed.items,
            source_type: imageBase64 ? "photo" : description ? "description" : null,
            source_storage_path: sourceStoragePath,
            source_description: description ?? null,
            status: "draft",
          })
          .select("id")
          .single();

        if (insertError || !list) {
          sendLine({ type: "error", error: "Got a materials list but could not save it." });
          controller.close();
          return;
        }

        sendLine({ type: "result", payload: { type: "materials", items: parsed.items, materialListId: list.id } });
        controller.close();
      },
    });

    return new Response(outStream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong." }, { status: 500 });
  }
}
