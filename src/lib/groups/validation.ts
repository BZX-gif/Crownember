import { containsInjection } from "@/lib/antibot";
import {
  MAX_GROUP_DESCRIPTION,
  MAX_GROUP_NAME,
  MIN_GROUP_NAME,
} from "@/lib/groups/limits";

/**
 * Group text rules, kept in a dependency-free module (no database, no Next.js)
 * so the exact same validation the server enforces can be unit-tested — and so
 * a client form can never drift from it.
 */

export const GROUP_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._·&'-]{1,46}[\p{L}\p{N}]$/u;

export interface GroupValidation {
  ok: boolean;
  name?: string;
  description?: string;
  error?: string;
}

export function validateGroupInput(input: {
  name?: unknown;
  description?: unknown;
}): GroupValidation {
  const name = String(input.name ?? "").replace(/\s+/g, " ").trim();
  const description = String(input.description ?? "").replace(/\r\n/g, "\n").trim();

  if (name.length < MIN_GROUP_NAME || name.length > MAX_GROUP_NAME) {
    return {
      ok: false,
      error: `Group name must be ${MIN_GROUP_NAME}–${MAX_GROUP_NAME} characters.`,
    };
  }
  if (!GROUP_NAME_PATTERN.test(name)) {
    return {
      ok: false,
      error: "Use letters, numbers, spaces and simple punctuation — no links or markup.",
    };
  }
  if (containsInjection(name) || containsInjection(description)) {
    return { ok: false, error: "Group text cannot contain code or script tags." };
  }
  if (description.length > MAX_GROUP_DESCRIPTION) {
    return {
      ok: false,
      error: `Description must be under ${MAX_GROUP_DESCRIPTION} characters.`,
    };
  }
  return { ok: true, name, description };
}
