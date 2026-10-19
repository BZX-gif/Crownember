/**
 * Image upload validation — shared by profile pictures and group pictures.
 *
 * The bug this replaces: `POST /api/profile/avatar` stored whatever
 * `Content-Type` the browser sent and `GET` served those bytes straight back
 * with that stored value as the response `Content-Type`. A member could label
 * an HTML document `image/png`, upload it, and the site would serve it from a
 * same-origin URL as `text/html` — a stored-XSS primitive that `nosniff` alone
 * does not fully close.
 *
 * Rule: the client's MIME type is a hint, never the answer.
 *   1. Reject anything over the byte limit before reading it.
 *   2. Sniff the real format from the file's magic bytes.
 *   3. If the declared type disagrees with the bytes, the bytes win.
 *   4. Store and serve only the sniffed type.
 *
 * No new dependencies: PNG/JPEG/WebP signatures are a handful of byte
 * comparisons, and animated formats (GIF/APNG) are not accepted at all.
 */

export const SUPPORTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type SupportedImageMimeType = (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

/** Profile pictures and group pictures share one 1 MB ceiling. */
export const MAX_IMAGE_BYTES = 1024 * 1024;

export type ImageValidationResult =
  | { ok: true; mime: SupportedImageMimeType; bytes: Buffer }
  | { ok: false; error: string };

function startsWith(buffer: Buffer, signature: number[], offset = 0): boolean {
  if (buffer.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (buffer[offset + i] !== signature[i]) return false;
  }
  return true;
}

function ascii(buffer: Buffer, offset: number, text: string): boolean {
  if (buffer.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (buffer[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Identify an image from its bytes alone.
 * - PNG: 8-byte signature, and the first chunk must be IHDR (a bare signature
 *   is trivially forgeable and is not an image).
 * - JPEG: SOI marker. The trailing EOI is not required — plenty of valid
 *   progressive files are re-encoded without it.
 * - WebP: RIFF....WEBP with a VP8/VP8L/VP8X payload.
 */
export function detectImageMime(input: Buffer | Uint8Array | null | undefined): SupportedImageMimeType | null {
  if (!input || input.length < 12) return null;
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);

  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    // bytes 12..16 hold the first chunk type
    return ascii(buffer, 12, "IHDR") ? "image/png" : null;
  }

  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }

  if (ascii(buffer, 0, "RIFF") && ascii(buffer, 8, "WEBP")) {
    const payload = buffer.subarray(12, 16).toString("latin1");
    if (payload === "VP8 " || payload === "VP8L" || payload === "VP8X") return "image/webp";
    return null;
  }

  return null;
}

/**
 * Validate an uploaded image.
 * `declaredType` is what the browser claimed; it is only used to reject
 * obviously-wrong submissions early — the stored/served type always comes from
 * the bytes.
 */
export function validateImageUpload(input: {
  bytes: Buffer | Uint8Array;
  declaredType?: string | null;
  maxBytes?: number;
  label?: string;
}): ImageValidationResult {
  const label = input.label ?? "Image";
  const maxBytes = input.maxBytes ?? MAX_IMAGE_BYTES;
  const buffer = Buffer.isBuffer(input.bytes) ? input.bytes : Buffer.from(input.bytes);

  if (buffer.length === 0) {
    return { ok: false, error: `${label} file is empty.` };
  }
  if (buffer.length > maxBytes) {
    return {
      ok: false,
      error: `${label} must be under ${Math.floor(maxBytes / (1024 * 1024)) || 1} MB.`,
    };
  }

  const mime = detectImageMime(buffer);
  if (!mime) {
    return {
      ok: false,
      error: `That file is not a real JPG, PNG or WebP image. ${label} files are checked by content, not by name.`,
    };
  }

  const declared = (input.declaredType ?? "").toLowerCase();
  if (declared && !(SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(declared)) {
    return { ok: false, error: `Use a JPG, PNG or WebP image for the ${label.toLowerCase()}.` };
  }

  return { ok: true, mime, bytes: buffer };
}

/** Validate a File from `formData()` (size is checked before the bytes are read). */
export async function validateImageFile(
  file: File,
  options: { maxBytes?: number; label?: string } = {},
): Promise<ImageValidationResult> {
  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES;
  const label = options.label ?? "Image";
  if (file.size > maxBytes) {
    return {
      ok: false,
      error: `${label} must be under ${Math.floor(maxBytes / (1024 * 1024)) || 1} MB.`,
    };
  }
  return validateImageUpload({
    bytes: Buffer.from(await file.arrayBuffer()),
    declaredType: file.type,
    maxBytes,
    label,
  });
}

/**
 * The `Content-Type` to serve for stored bytes. Falls back to a sniff of the
 * stored bytes when the recorded mime is missing or disagrees with them, so
 * legacy rows written before the sniff existed can never be served as HTML.
 */
export function safeServeMime(
  bytes: Buffer | Uint8Array,
  storedMime: string | null | undefined,
): SupportedImageMimeType | null {
  // The sniffed type is always returned: a stored mime that disagrees with the
  // bytes is exactly the spoofing case we refuse to serve.
  void storedMime;
  return detectImageMime(bytes);
}

/** Minimal, well-formed fixtures used by the test suite and by nothing else. */
export const TEST_IMAGES = {
  /** 1x1 transparent PNG. */
  png: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF+p7RLAAAAAElFTkSuQmCC",
    "base64",
  ),
  /** Smallest legal JPEG (1x1 white). */
  jpeg: Buffer.from(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
      "HBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDs0NDT/wAALCAABAAEBAREA/8QAFAABAQAAAAAA" +
      "AAAAAAAKAwEC/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AmgAAAP/Z",
    "base64",
  ),
  /** 1x1 lossy WebP. */
  webp: Buffer.from(
    "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=",
    "base64",
  ),
};
