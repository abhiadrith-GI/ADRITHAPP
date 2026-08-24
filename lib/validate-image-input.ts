const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

// A generous cap for a real phone photo (modern phone photos typically
// land in the 2-8MB range) while still closing off the actual gap: with
// no limit at all, a client could send an arbitrarily large payload that
// gets forwarded straight to a paid AI API call on every request, or tie
// up server memory decoding it. 14MB of base64 text decodes to roughly
// 10.5MB of real image data.
const MAX_BASE64_LENGTH = 14 * 1024 * 1024;

/**
 * Validates a client-supplied {imageBase64, imageMediaType} pair before
 * it's used for anything - forwarded to an AI API, uploaded to storage,
 * or decoded at all. Returns an error string if invalid, null if fine.
 * Both callers treat a non-null return as a 400 response.
 */
export function validateImageInput(imageBase64?: string, imageMediaType?: string): string | null {
  if (!imageBase64 && !imageMediaType) return null; // no image provided - fine, it's optional everywhere it's used

  if (!imageBase64 || !imageMediaType) {
    return "An image needs both its data and its type.";
  }
  if (!ALLOWED_IMAGE_TYPES.has(imageMediaType)) {
    return "That image type isn't supported - please use JPEG, PNG, or WebP.";
  }
  if (imageBase64.length > MAX_BASE64_LENGTH) {
    return "That image is too large - please use a smaller photo.";
  }
  // A quick, cheap sanity check that this is plausibly base64 at all,
  // before anything downstream spends real time/money treating it as
  // image data.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) {
    return "That image data looks corrupted - please try uploading it again.";
  }
  return null;
}
