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
        // material line items, which lands at or past that ceiling. Both
        // real failures reported were exactly this kind of comprehensive,
        // detailed request, not sparse ones - raised with real headroom
        // rather than nudged up just past what broke.
        max_tokens: 4000,
        system: buildMaterialSystemPrompt(trade, roomType),
        messages: anthropicMessages,
      }),
    });

    if (!aiResp.ok) {
      let detail = "";
      try {
        const errBody = await aiResp.json();
        detail = errBody?.error?.message ?? "";
      } catch {}
      return NextResponse.json({ error: `AI request failed (${aiResp.status}).${detail ? " " + detail : ""}` }, { status: 502 });
    }

    const aiData = await aiResp.json();
    const rawText: string = aiData.content?.find((b: { type: string }) => b.type === "text")?.text ?? "";

    // A response cut off by the token ceiling is truncated mid-JSON and
    // will never parse, no matter how the extraction below is written -
    // this is what actually broke real, detailed submissions: a genuinely
    // comprehensive room was landing right at the old 1500-token limit.
    // Checking stop_reason directly, instead of only inferring truncation
    // from a parse failure, means a precise, honest answer if this ever
    // happens again even at the new ceiling, not another guessing round.
    if (aiData.stop_reason === "max_tokens") {
      console.error("[materials/analyze] hit max_tokens ceiling, response truncated", {
        roomType,
        trade,
        isFirstTurn,
        rawTextLength: rawText.length,
      });
      return NextResponse.json(
        { error: "That request needs a longer response than expected — try fewer fixtures at once, or try again." },
        { status: 502 }
      );
    }

    // Turn 1 only ever has to produce JSON cold, and reliably does. From
    // turn 2 on, the model sees its own prior JSON-only reply echoed back
    // as a conversation turn, then a fresh, often informally-phrased user
    // answer to respond to - exactly the situation where a model tends to
    // add a short acknowledgment before the JSON despite being told not
    // to. Stripping code fences and trusting the whole remaining string
    // is valid JSON isn't enough once that happens - pull out just the
    // {...} object instead of requiring the entire response to be clean.
    let parsed: MaterialAnalysisResult;
    try {
      const withoutFences = rawText.replace(/```json|```/g, "").trim();
      const firstBrace = withoutFences.indexOf("{");
      const lastBrace = withoutFences.lastIndexOf("}");
      const cleaned =
        firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace
          ? withoutFences.slice(firstBrace, lastBrace + 1)
          : withoutFences;
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      // However this happens next time, it should be visible in Netlify's
      // function logs immediately rather than needing another screenshot
      // and another round of speculation to track down.
      console.error("[materials/analyze] JSON parse failed", {
        roomType,
        trade,
        isFirstTurn,
        stopReason: aiData.stop_reason,
        rawTextLength: rawText.length,
        rawTextSnippet: rawText.slice(0, 300),
        parseErrorMessage: parseErr instanceof Error ? parseErr.message : String(parseErr),
      });
      return NextResponse.json({ error: "Could not read the AI's response — please try again." }, { status: 502 });
    }

    const newHistory: ConversationTurn[] = [...anthropicMessages.map((m) => ({ role: m.role as "user" | "assistant", content: typeof m.content === "string" ? m.content : "[image + text]" })), { role: "assistant", content: rawText }];

    if (parsed.type === "clarifying_question") {
      return NextResponse.json({ type: "clarifying_question", question: parsed.question, conversationHistory: newHistory });
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
      return NextResponse.json({ error: "Got a materials list but could not save it." }, { status: 500 });
    }

    return NextResponse.json({ type: "materials", items: parsed.items, materialListId: list.id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong." }, { status: 500 });
  }
}
