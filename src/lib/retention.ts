/**
 * Ephemeral chat, per-room burn rates:
 *   - public rooms: messages self-destruct after 3 hours
 *   - the private room (vault): messages self-destruct after 15 minutes
 * Keeps the free database tiny forever. The forum is the permanent archive —
 * anything worth keeping belongs in a topic.
 *
 * PURE HELPERS ONLY — safe to import in client components.
 * The actual database purge lives in src/lib/purge.ts (server-side).
 */
export const MESSAGE_TTL_MS = 3 * 60 * 60 * 1000;
export const VAULT_TTL_MS = 15 * 60 * 1000;

export function ttlForRoom(isVault: boolean): number {
  return isVault ? VAULT_TTL_MS : MESSAGE_TTL_MS;
}

export function messageCutoff(isVault = false): Date {
  return new Date(Date.now() - ttlForRoom(isVault));
}

export function msUntilExpiry(
  createdAt: Date | string,
  isVault = false,
): number {
  const t =
    typeof createdAt === "string"
      ? new Date(createdAt).getTime()
      : createdAt.getTime();
  return t + ttlForRoom(isVault) - Date.now();
}

export function formatTimeLeft(ms: number): string {
  if (ms <= 0) return "gone";
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  const s = Math.floor((ms % 60_000) / 1000);
  if (m === 0) return `${s}s`;
  return `${m}m`;
}
