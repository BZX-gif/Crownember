/**
 * The sticker wall — famous ones only. A message made purely of 1–3 emoji
 * renders as a giant sticker instead of a text line.
 */
export const STICKER_PACK = [
  "🔥", "💀", "😂", "👑", "🐐", "😎", "🏆", "💯",
  "🍗", "⚡", "🎯", "🤝", "😤", "🙏", "💪", "🫡",
  "😭", "🤡", "💣", "🎮", "🛡️", "⚔️", "🚀", "💎",
  "🍀", "😈", "🧊", "❌", "🤯", "😴", "🥶", "👀",
] as const;

const PICTO = /\p{Extended_Pictographic}/gu;
const STRIP =
  /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}\s]/gu;

/** True when the message is pure emoji (1–3 glyphs) → render as sticker. */
export function isSticker(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 16) return false;
  if (t.replace(STRIP, "").length > 0) return false;
  const count = (t.match(PICTO) ?? []).length;
  return count >= 1 && count <= 3;
}
