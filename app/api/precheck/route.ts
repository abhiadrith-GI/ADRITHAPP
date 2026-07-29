import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Runs a quick AI sanity check on a just-uploaded checkpoint photo, then
 * records the result via record_ai_precheck (schema.sql) - the one
 * narrow, function-enforced exception to checkpoint_evidence otherwise
 * never being updatable after upload.
 *
 * Deliberately scoped to what a vision model can honestly assess: is the
 * photo clear and usable, and does it plausibly show what this checkpoint
 * is asking about. It does NOT attempt to judge structural correctness,
 * code compliance, or measurements - that stays entirely the engineer's
 * call. This is a first-pass sanity check, not a stamp of approval, and
 * it never blocks Pass/Fail/Flag either way - only the designer decides.
 *
 * Fails gracefully at every step: a missing API key, a network error, or
 * anything else here should never break the actual photo upload, which
 * has already succeeded and is already permanent by the time this runs.
 */
export async function POST(req: NextRequest) {
  const { evidenceId, storagePath, checkpointDescription } = await req.json();

  if (!evidenceId || !storagePath) {
    return NextResponse.json({ error: "Missing evidenceId or storagePath" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Not configured yet - skip silently rather than error. The photo
    // itself is already uploaded and permanent regardless.
    await supabase.rpc("record_ai_precheck", {
      target_evidence_id: evidenceId,
      new_status: "failed",
      note: null,
    });
    return NextResponse.json({ status: "skipped" });
  }

  try {
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("checkpoint-evidence")
      .createSignedUrl(storagePath, 300);

    if (signedUrlError || !signedUrlData) {
      throw new Error("Could not access the uploaded photo");
    }

    const imageResp = await fetch(signedUrlData.signedUrl);
    if (!imageResp.ok) throw new Error("Could not download the uploaded photo");
    const imageBuffer = await imageResp.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString("base64");

    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: "image/jpeg", data: base64Image },
              },
              {
                type: "text",
                text:
                  `This is a quick, preliminary sanity check on a construction site photo - ` +
                  `not a professional inspection. The checkpoint this photo is for reads: ` +
                  `"${checkpointDescription ?? "unknown"}". In one short sentence, note whether ` +
                  `the photo is clear and usable (not blurry, not too dark) and whether what's ` +
                  `visible plausibly relates to that checkpoint, or looks unrelated. Do not ` +
                  `judge structural correctness, code compliance, or measurements - only note ` +
                  `whether this is a legible, relevant photo. Be concise, one sentence.`,
              },
            ],
          },
        ],
      }),
    });

    if (!aiResp.ok) throw new Error(`AI request failed: ${aiResp.status}`);

    const aiData = await aiResp.json();
    const note: string =
      aiData.content?.find((block: { type: string }) => block.type === "text")?.text?.trim() ??
      "Precheck completed, but no readable note was returned.";

    await supabase.rpc("record_ai_precheck", {
      target_evidence_id: evidenceId,
      new_status: "done",
      note,
    });

    return NextResponse.json({ status: "done", note });
  } catch {
    await supabase.rpc("record_ai_precheck", {
      target_evidence_id: evidenceId,
      new_status: "failed",
      note: null,
    });
    return NextResponse.json({ status: "failed" });
  }
}
