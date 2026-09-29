const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"]);

// A generous cap for a real phone photo or a scanned floor plan (modern
// phone photos typically land in the 2-8MB range, and a multi-page PDF
// floor plan export can run larger) while still closing off the actual
// gap: with no limit at all, a client could send an arbitrarily large
// payload that gets forwarded straight to a paid AI API call on every
// request, or tie up server memory decoding it. 14MB of base64 text
// decodes to roughly 10.5MB of real file data.
const MAX_BASE64_LENGTH = 14 * 1024 * 1024;

/**
 * A declared MIME type is just a string the client chose. This checks the
 * file's real leading bytes ("magic numbers") against what it claims to be,
 * so a script or arbitrary blob can't be stored, or forwarded to the AI
 * provider, dressed up as a photo or PDF.
 */
function bytesMatchDeclaredType(base64: string, mediaType: string): boolean {
  const head = Buffer.from(base64.slice(0, 24), "base64"); // first ~18 bytes
  const ascii = (from: number, to: number) => head.subarray(from, to).toString("latin1");
  switch (mediaType) {
    case "application/pdf":
      return ascii(0, 5) === "%PDF-";
    case "image/png":
      return head.length >= 8 && head[0] === 0x89 && ascii(1, 4) === "PNG";
    case "image/jpeg":
    case "image/jpg":
      return head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case "image/webp":
      return head.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    default:
      return false;
  }
}

/**
 * Validates a client-supplied {imageBase64, imageMediaType} pair before
 * it's used for anything - forwarded to an AI API, uploaded to storage,
 * or decoded at all. Accepts images and PDFs (the caller is responsible
 * for sending PDFs to the AI as a document content block, not an image
 * one - see app/api/vastu/chat/route.ts). Returns an error string if
 * invalid, null if fine. Both callers treat a non-null return as a 400
 * response.
 */
export function validateImageInput(imageBase64?: string, imageMediaType?: string): string | null {
  if (!imageBase64 && !imageMediaType) return null; // nothing provided - fine, it's optional everywhere it's used

  if (!imageBase64 || !imageMediaType) {
    return "A file needs both its data and its type.";
  }
  if (!ALLOWED_TYPES.has(imageMediaType)) {
    return "That file type isn't supported - please use a JPEG, PNG, WebP photo, or a PDF.";
  }
  if (imageBase64.length > MAX_BASE64_LENGTH) {
    return "That file is too large - please use a smaller one.";
  }
  // A quick, cheap sanity check that this is plausibly base64 at all,
  // before anything downstream spends real time/money treating it as
  // real file data.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) {
    return "That file's data looks corrupted - please try uploading it again.";
  }
  if (!bytesMatchDeclaredType(imageBase64, imageMediaType)) {
    return "That file doesn't look like a real " + (imageMediaType === "application/pdf" ? "PDF" : "photo") + " - please try a different one.";
  }
  return null;
}
