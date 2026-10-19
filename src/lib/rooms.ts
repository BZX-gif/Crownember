import type { rooms } from "@/db/schema";

export type RoomIconKey = "chat" | "compass" | "lock" | "hash";

export interface RoomDisplay {
  name: string;
  description: string;
  icon: RoomIconKey;
  /** Short, honest retention label. */
  retention: string;
}

/**
 * Production still contains the original room rows (including "Community
 * Guides" with Free Fire copy and an "OMEGA VAULT" slug). Those rows are
 * community data and must not be rewritten by a deploy. The UI therefore
 * owns the presentation for the rooms that exist in every deployment.
 * Unknown/custom rooms fall back to their database name and description,
 * with any leading emoji stripped.
 */
const KNOWN: Record<string, RoomDisplay> = {
  global: {
    name: "Global",
    description: "The open room. Every voice is welcome here.",
    icon: "chat",
    retention: "Clears after 3 hours",
  },
  guides: {
    name: "Community",
    description: "Recommendations, answers and shared wisdom.",
    icon: "compass",
    retention: "Clears after 3 hours",
  },
  tips: {
    name: "Community",
    description: "Recommendations, answers and shared wisdom.",
    icon: "compass",
    retention: "Clears after 3 hours",
  },
  vault: {
    name: "The Vault",
    description: "Members-only. Sealed by passcode, burned on exit.",
    icon: "lock",
    retention: "Clears after 14 minutes",
  },
  "omega-vault": {
    name: "The Vault",
    description: "Members-only. Sealed by passcode, burned on exit.",
    icon: "lock",
    retention: "Clears after 14 minutes",
  },
};

function stripLeadingEmoji(value: string): string {
  return value.replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, "").trim();
}

export function roomDisplay(room: {
  slug: string;
  name: string;
  description: string;
  isVault: boolean;
}): RoomDisplay {
  const known = KNOWN[room.slug];
  if (known) return known;
  if (room.isVault) {
    return {
      name: stripLeadingEmoji(room.name) || "The Vault",
      description: room.description || KNOWN.vault.description,
      icon: "lock",
      retention: "Clears after 14 minutes",
    };
  }
  return {
    name: stripLeadingEmoji(room.name) || "Room",
    description: room.description || "Open conversation.",
    icon: "hash",
    retention: "Clears after 3 hours",
  };
}

export function roomDisplayFromRow(room: typeof rooms.$inferSelect): RoomDisplay {
  return roomDisplay(room);
}
