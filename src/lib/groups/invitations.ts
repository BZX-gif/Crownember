/**
 * Group invitation state machine — pure logic, no database.
 *
 * Two-phase by design:
 *
 *   proposed ──approve──▶ invited ──accept──▶ accepted
 *      │                    │  └──decline──▶ declined
 *      ├──reject──▶ rejected└──revoke────▶ revoked
 *      └──revoke──▶ revoked      (expiry)─▶ expired
 *
 * A row only ever becomes a membership through `accepted`, which is written
 * inside the transaction that re-checks everything (see lib/groups/service.ts).
 * Creating or approving an invitation NEVER makes anyone a member.
 */

export const INVITATION_STATUSES = [
  "proposed",
  "invited",
  "accepted",
  "rejected",
  "revoked",
  "expired",
  "declined",
] as const;

export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/** Live rows: waiting for a manager, or waiting for the invitee. */
export const OPEN_INVITATION_STATUSES: readonly InvitationStatus[] = ["proposed", "invited"];

export function isOpenInvitation(status: string | null | undefined): boolean {
  return (OPEN_INVITATION_STATUSES as readonly string[]).includes(String(status));
}

export function isInvitationStatus(value: unknown): value is InvitationStatus {
  return typeof value === "string" && (INVITATION_STATUSES as readonly string[]).includes(value);
}

/** An invitation lives for a week, then it must be proposed again. */
export const INVITATION_TTL_DAYS = 7;
export const INVITATION_TTL_MS = INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000;

export const MAX_INVITATION_MESSAGE = 240;

export function invitationExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITATION_TTL_MS);
}

export function isExpired(expiresAt: Date | string | null | undefined, now: Date = new Date()) {
  if (!expiresAt) return false;
  const expiry = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  if (Number.isNaN(expiry.getTime())) return false;
  return expiry.getTime() <= now.getTime();
}

/** Manager decisions. `reject` answers a proposal, `revoke` withdraws either. */
export type InvitationDecision = "approve" | "reject" | "revoke";

const DECISION_PAST_TENSE: Record<InvitationDecision, string> = {
  approve: "approved",
  reject: "rejected",
  revoke: "revoked",
};

const DECISION_TRANSITIONS: Record<InvitationDecision, Partial<Record<InvitationStatus, InvitationStatus>>> = {
  approve: { proposed: "invited" },
  reject: { proposed: "rejected" },
  revoke: { proposed: "revoked", invited: "revoked" },
};

export type InvitationDecisionResult =
  | { ok: true; status: InvitationStatus; already: boolean }
  | { ok: false; code: "not_found" | "invalid_transition" | "expired"; error: string };

/**
 * The only legal way to move an invitation forward. Anything else — approving
 * an accepted row, re-approving a revoked one, deciding an expired invitation —
 * is refused with a message that does not leak group details.
 */
export function decideInvitation(input: {
  status: string;
  decision: InvitationDecision;
  expiresAt?: Date | string | null;
  now?: Date;
}): InvitationDecisionResult {
  const now = input.now ?? new Date();
  if (!isInvitationStatus(input.status)) {
    return { ok: false, code: "not_found", error: "That invitation no longer exists." };
  }
  const status = input.status;
  const wanted = DECISION_TRANSITIONS[input.decision][status];

  if (!wanted) {
    // Already in the state the actor asked for: idempotent, not an error.
    if (input.decision === "revoke" && status === "revoked") {
      return { ok: true, status, already: true };
    }
    if (isExpired(input.expiresAt, now)) {
      return { ok: false, code: "expired", error: "That invitation has expired." };
    }
    if (input.decision === "approve" && status === "invited") {
      return { ok: true, status, already: true };
    }
    return {
      ok: false,
      code: "invalid_transition",
      error:
        status === "accepted"
          ? "That invitation has already been accepted."
          : status === "declined"
            ? "That invitation was declined."
            : `That invitation is ${status} and cannot be ${DECISION_PAST_TENSE[input.decision]}.`,
    };
  }

  if (isExpired(input.expiresAt, now)) {
    return { ok: false, code: "expired", error: "That invitation has expired." };
  }
  return { ok: true, status: wanted, already: false };
}

export type AcceptCode =
  | "not_found"
  | "not_invitee"
  | "not_approved"
  | "revoked"
  | "expired"
  | "already_member"
  | "group_full"
  | "account_ineligible";

export type AcceptVerdict =
  | { ok: true; status: "accepted" }
  | { ok: false; code: AcceptCode; error: string };

/**
 * Pre-transaction verdict for an invitee pressing "Accept". The service runs
 * this AGAIN inside the transaction that holds the group row lock, so a
 * concurrent acceptance cannot slip past it — this copy only produces the
 * friendly response without a lock.
 *
 * Every refusal message is safe to show the invitee: they were named in the
 * invitation, so the group's existence is already known to them.
 */
export function evaluateAcceptance(input: {
  invitation: { status: string; inviteeId: number; expiresAt: Date | string | null } | null;
  viewerId: number;
  now?: Date;
  alreadyMember?: boolean;
  memberCount?: number;
  memberLimit?: number;
  accountEligible?: boolean;
}): AcceptVerdict {
  const now = input.now ?? new Date();
  const invitation = input.invitation;
  if (!invitation) {
    return { ok: false, code: "not_found", error: "That invitation no longer exists." };
  }
  if (invitation.inviteeId !== input.viewerId) {
    return { ok: false, code: "not_invitee", error: "That invitation is not addressed to you." };
  }
  if (input.accountEligible === false) {
    return {
      ok: false,
      code: "account_ineligible",
      error: "This account cannot join a group right now.",
    };
  }
  if (input.alreadyMember) {
    return { ok: false, code: "already_member", error: "You are already a member of this group." };
  }
  if (!isInvitationStatus(invitation.status)) {
    return { ok: false, code: "not_found", error: "That invitation no longer exists." };
  }
  switch (invitation.status) {
    case "proposed":
      return {
        ok: false,
        code: "not_approved",
        error: "That invitation has not been approved yet.",
      };
    case "accepted":
      return { ok: false, code: "already_member", error: "You are already a member of this group." };
    case "revoked":
      return { ok: false, code: "revoked", error: "That invitation was withdrawn." };
    case "rejected":
      return { ok: false, code: "revoked", error: "That invitation was not approved." };
    case "declined":
      return { ok: false, code: "revoked", error: "You already declined that invitation." };
    case "expired":
      return { ok: false, code: "expired", error: "That invitation has expired." };
    default:
      break;
  }
  if (isExpired(invitation.expiresAt, now)) {
    return { ok: false, code: "expired", error: "That invitation has expired." };
  }
  const count = input.memberCount ?? 0;
  const limit = input.memberLimit ?? Number.POSITIVE_INFINITY;
  if (count >= limit) {
    return { ok: false, code: "group_full", error: "That group is full right now." };
  }
  return { ok: true, status: "accepted" };
}
