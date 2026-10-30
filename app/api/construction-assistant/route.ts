import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { buildConstructionSystemPrompt } from "@/lib/construction/system-prompt";

// Cost control: this is a free feature, so every knob is kept small.
// The real caps (per user per day, and across all users per day) live in the
// database trigger, so they hold no matter what the browser sends.
const MODEL = "claude-haiku-4-5-20251001";
const MAX_OUTPUT_TOKENS = 700;
const HISTORY_MESSAGES = 10; // only the last few turns are sent to the model
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { conversationId, message } = body as { conversationId?: unknown; message?: unknown };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "A question is required." }, { status: 400 });
  }
  if (message.trim().length > 2000) {
    return NextResponse.json({ error: "Please keep your question under 2,000 characters." }, { status: 400 });
  }
  if (conversationId != null && (typeof conversationId !== "string" || !UUID.test(conversationId))) {
    return NextResponse.json({ error: "That conversation was not found." }, { status: 404 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!apiKey || !serviceKey || !supabaseUrl) {
    return NextResponse.json({ error: "The assistant is not configured yet." }, { status: 503 });
  }
  // The server alone writes the assistant's answers and releases failed
  // questions - users cannot plant fake answers or delete their own records.
  const ledger = createServiceClient(supabaseUrl, serviceKey);

  // Resolve or create the conversation.
  let convoId = conversationId as string | undefined;
  if (!convoId) {
    const { data: convo, error: convoErr } = await supabase
      .from("construction_chat_conversations")
      .insert({ user_id: user.id })
      .select("id")
      .single();
    if (convoErr || !convo) {
      return NextResponse.json({ error: "Could not start a new conversation." }, { status: 500 });
    }
    convoId = convo.id;
  } else {
    const { data: existing } = await supabase
      .from("construction_chat_conversations")
      .select("id")
      .eq("id", convoId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: "That conversation was not found." }, { status: 404 });
    }
  }

  // Save the question FIRST. The database trigger checks both daily caps on
  // this insert, so if either is reached nothing is sent to the AI at all.
  const { data: userMsg, error: userMsgErr } = await supabase
    .from("construction_chat_messages")
    .insert({ conversation_id: convoId, user_id: user.id, role: "user", content: message.trim() })
    .select("id")
    .single();

  if (userMsgErr || !userMsg) {
    const text = userMsgErr?.message ?? "";
    const limitHit = text.includes("Daily message limit") || text.includes("free daily capacity");
    return NextResponse.json(
      {
        error: limitHit
          ? text.includes("free daily capacity")
            ? "The assistant has reached its free daily capacity - please try again tomorrow."
            : "You have reached today's question limit - please try again tomorrow."
          : "Could not save your question.",
        conversationId: convoId,
      },
      { status: limitHit ? 429 : 500 }
    );
  }

  // A failed AI call must not cost the user one of their questions.
  const release = async () => {
    await ledger.from("construction_chat_messages").delete().eq("id", userMsg.id);
  };

  // Recent turns only: keeps each call cheap, and the model starts on a user turn.
  const { data: recent } = await supabase
    .from("construction_chat_messages")
    .select("role, content")
    .eq("conversation_id", convoId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_MESSAGES);
  const turns = (recent ?? []).reverse();
  while (turns.length > 0 && turns[0].role !== "user") turns.shift();

  try {
    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: buildConstructionSystemPrompt(),
        messages: turns.map((m) => ({ role: m.role, content: m.content })),
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!aiResp.ok) {
      await release();
      return NextResponse.json(
        { error: "The assistant could not answer right now - please try again in a moment.", conversationId: convoId },
        { status: 502 }
      );
    }

    const aiData = await aiResp.json();
    const replyText: string = (aiData.content?.find((b: { type: string }) => b.type === "text")?.text ?? "").trim().slice(0, 8000);
    if (!replyText) {
      await release();
      return NextResponse.json({ error: "The assistant returned an empty answer - please try again.", conversationId: convoId }, { status: 502 });
    }

    const { error: assistantErr } = await ledger
      .from("construction_chat_messages")
      .insert({ conversation_id: convoId, user_id: user.id, role: "assistant", content: replyText });
    if (assistantErr) {
      await release();
      return NextResponse.json({ error: "Got an answer but could not save it - please try again.", conversationId: convoId }, { status: 500 });
    }

    return NextResponse.json({ conversationId: convoId, reply: replyText });
  } catch {
    await release();
    return NextResponse.json({ error: "The assistant could not answer right now - please try again in a moment.", conversationId: convoId }, { status: 500 });
  }
}
