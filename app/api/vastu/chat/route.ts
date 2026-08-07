import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildVastuSystemPrompt } from "@/lib/vastu/grounding";

// After this many user messages in one conversation, the UI shows a
// persistent "talk to us directly" prompt regardless of what the AI itself
// says - a deterministic safety net, not left to the model's own judgment
// about whether it's making progress. The system prompt also asks the AI
// to suggest this proactively when a question is genuinely out of scope;
// this is the guaranteed fallback for when it doesn't.
const ESCALATION_THRESHOLD = 5;

export async function POST(req: NextRequest) {
  const { conversationId, message, imageBase64, imageMediaType } = await req.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "A message is required." }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI analysis is not configured yet." }, { status: 503 });
  }

  // Resolve or create the conversation.
  let convoId: string = conversationId;
  if (!convoId) {
    const { data: convo, error: convoErr } = await supabase
      .from("vastu_chat_conversations")
      .insert({ user_id: user.id })
      .select("id")
      .single();
    if (convoErr || !convo) {
      return NextResponse.json({ error: "Could not start a new conversation." }, { status: 500 });
    }
    convoId = convo.id;
  } else {
    const { data: existing } = await supabase
      .from("vastu_chat_conversations")
      .select("id")
      .eq("id", convoId)
      .eq("user_id", user.id)
      .single();
    if (!existing) {
      return NextResponse.json({ error: "That conversation was not found." }, { status: 404 });
    }
  }

  // Upload the photo first, if there is one - the storage path gets
  // attached to the user's own message row below.
  let imageStoragePath: string | null = null;
  if (imageBase64 && imageMediaType) {
    const ext = imageMediaType === "image/png" ? "png" : "jpg";
    const path = `${user.id}/${convoId}/${crypto.randomUUID()}.${ext}`;
    const bytes = Buffer.from(imageBase64, "base64");
    const { error: uploadErr } = await supabase.storage
      .from("vastu-chat-files")
      .upload(path, bytes, { contentType: imageMediaType });
    if (uploadErr) {
      return NextResponse.json({ error: "Could not upload that photo." }, { status: 500 });
    }
    imageStoragePath = path;
  }

  // Insert the user's message. This is what the rate-limit trigger checks
  // against - if today's cap is already reached, this insert fails and no
  // AI call ever happens, same fail-closed shape as every other AI route
  // in this platform.
  const { data: userMsg, error: userMsgErr } = await supabase
    .from("vastu_chat_messages")
    .insert({ conversation_id: convoId, user_id: user.id, role: "user", content: message.trim(), image_storage_path: imageStoragePath })
    .select("id")
    .single();

  if (userMsgErr || !userMsg) {
    const limitHit = userMsgErr?.message?.includes("Daily message limit");
    return NextResponse.json(
      { error: limitHit ? "Daily message limit reached for Ask Vastu today - please try again tomorrow." : "Could not save your message." },
      { status: limitHit ? 429 : 500 }
    );
  }

  // Pull the real conversation history for context - not just this one message.
  const { data: history } = await supabase
    .from("vastu_chat_messages")
    .select("role, content")
    .eq("conversation_id", convoId)
    .order("created_at", { ascending: true });

  const userMessageCountToday = (history ?? []).filter((m) => m.role === "user").length;

  const anthropicMessages = (history ?? []).map((m, i, arr) => {
    const isLastUserMessage = i === arr.length - 1 && m.role === "user";
    if (isLastUserMessage && imageBase64 && imageMediaType) {
      return {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: imageMediaType, data: imageBase64 } },
          { type: "text", text: m.content },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

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
        max_tokens: 1200,
        system: buildVastuSystemPrompt(),
        messages: anthropicMessages,
      }),
    });

    if (!aiResp.ok) {
      let detail = "";
      try {
        const errBody = await aiResp.json();
        detail = errBody?.error?.message ?? "";
      } catch {}
      // The user's message stays saved either way - same fairness principle
      // as elsewhere, but there's no "reservation" to delete here, since the
      // message itself is the real record of what was asked. What we avoid
      // is silently losing the question if the AI call fails.
      return NextResponse.json(
        { error: `AI request failed (${aiResp.status}).${detail ? " " + detail : ""}`, conversationId: convoId },
        { status: 502 }
      );
    }

    const aiData = await aiResp.json();
    const replyText: string = aiData.content?.find((b: { type: string }) => b.type === "text")?.text ?? "";

    const { error: assistantMsgErr } = await supabase
      .from("vastu_chat_messages")
      .insert({ conversation_id: convoId, user_id: user.id, role: "assistant", content: replyText });
    if (assistantMsgErr) {
      return NextResponse.json({ error: "Got a reply but could not save it.", conversationId: convoId }, { status: 500 });
    }

    return NextResponse.json({
      conversationId: convoId,
      reply: replyText,
      showEscalationPrompt: userMessageCountToday >= ESCALATION_THRESHOLD,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Something went wrong.", conversationId: convoId },
      { status: 500 }
    );
  }
}
