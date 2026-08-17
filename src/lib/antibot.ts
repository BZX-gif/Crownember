/**
 * Anti-bot / anti-cheat helpers.
 *
 * Honeypot: every form carries a hidden "website" field. Real users never
 * see or fill it — bots auto-fill everything, so a non-empty value means bot.
 *
 * Content filter: React already escapes all output (so no XSS can render),
 * this is defense-in-depth against script/link injection attempts.
 */

export function botTrap(body: Record<string, unknown>): boolean {
  const honey = body.website ?? body.homepage ?? "";
  return String(honey).trim().length > 0;
}

const SUSPICIOUS_PATTERN =
  /<\s*(script|iframe|object|embed)|javascript\s*:|on(error|load|click|mouseover)\s*=/i;

export function containsInjection(text: string): boolean {
  return SUSPICIOUS_PATTERN.test(text);
}

export function tooFast(formOpenedAt: unknown, minMs = 1500): boolean {
  const opened = Number(formOpenedAt);
  if (!Number.isFinite(opened) || opened <= 0) return false;
  return Date.now() - opened < minMs;
}
