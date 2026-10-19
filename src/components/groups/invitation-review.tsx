"use client";

import { Button, EmptyState } from "@/components/primitives";
import { Avatar } from "@/components/ui";
import { jsonInit, useGroupAction } from "@/components/use-group-action";
import { CheckIcon, MailIcon, XIcon } from "@/components/icons";
import { formatDate } from "@/lib/utils";
import { MAX_INVITATION_MESSAGE } from "@/lib/groups/invitations";

export interface ReviewInvitation {
  id: number;
  status: string;
  message: string;
  inviteeUsername: string;
  invitedByUsername?: string;
  createdAt: string;
  expiresAt: string;
  approvedAt: string | null;
}

/**
 * The manager's review queue: proposals from members (approve → the invitee is
 * then asked), and invitations already sent (revoke if plans changed).
 *
 * The list is server-rendered — it is only ever included in the HTML of a
 * viewer who already holds `reviewInvitations`, and every action re-checks that
 * permission on the server, so this component is presentation only.
 */
export function GroupInvitationReview({
  groupId,
  invitations,
}: {
  groupId: number;
  invitations: ReviewInvitation[];
}) {
  const { busy, call } = useGroupAction();

  const proposed = invitations.filter((invitation) => invitation.status === "proposed");
  const sent = invitations.filter((invitation) => invitation.status === "invited");

  async function decide(invitationId: number, decision: "approve" | "reject" | "revoke") {
    const result = await call(
      `${decision}-${invitationId}`,
      `/api/groups/${groupId}/invitations`,
      jsonInit("PATCH", { invitationId, decision }),
      {
        title:
          decision === "approve"
            ? "Invitation approved"
            : decision === "reject"
              ? "Proposal rejected"
              : "Invitation revoked",
        description:
          decision === "approve"
            ? "They can now accept it from their own groups page."
            : undefined,
      },
    );
    return result;
  }

  return (
    <section aria-labelledby="group-invitations-heading" className="rounded-xl border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2
          id="group-invitations-heading"
          className="text-xs font-semibold uppercase tracking-[0.14em] text-muted"
        >
          Invitations
        </h2>
        <p className="mono-meta">
          {proposed.length} to review · {sent.length} awaiting an answer
        </p>
      </div>

      {invitations.length === 0 ? (
        <div className="px-4 py-3">
          <EmptyState
            icon={<MailIcon size={16} />}
            title="Nothing waiting"
            description="Proposals from members appear here. Nobody joins until you approve one and they accept it."
            className="border-0 py-8"
          />
        </div>
      ) : null}

      {proposed.length > 0 && (
        <ul className="divide-y divide-line">
          {proposed.map((invitation) => (
            <li key={invitation.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar name={invitation.inviteeUsername} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-fg wrap-anywhere">
                  <span className="font-medium">{invitation.invitedByUsername ?? "A member"}</span>{" "}
                  proposed <span className="font-medium">{invitation.inviteeUsername}</span>
                </p>
                {invitation.message && (
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted wrap-anywhere">
                    {invitation.message.slice(0, MAX_INVITATION_MESSAGE)}
                  </p>
                )}
                <p className="mono-meta mt-1">
                  Proposed {formatDate(invitation.createdAt)} · expires{" "}
                  {formatDate(invitation.expiresAt)}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Button
                  variant="primary"
                  size="xs"
                  loading={busy === `approve-${invitation.id}`}
                  onClick={() => void decide(invitation.id, "approve")}
                >
                  <CheckIcon size={13} /> Approve
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  loading={busy === `reject-${invitation.id}`}
                  onClick={() => void decide(invitation.id, "reject")}
                >
                  <XIcon size={13} /> Reject
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {sent.length > 0 && (
        <div className={proposed.length > 0 ? "border-t border-line" : undefined}>
          <p className="px-4 pt-3 text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">
            Awaiting their answer
          </p>
          <ul className="divide-y divide-line">
            {sent.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar name={invitation.inviteeUsername} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{invitation.inviteeUsername}</p>
                  <p className="mono-meta mt-0.5">
                    Approved {invitation.approvedAt ? formatDate(invitation.approvedAt) : "—"} ·
                    expires {formatDate(invitation.expiresAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  loading={busy === `revoke-${invitation.id}`}
                  onClick={() => void decide(invitation.id, "revoke")}
                  className="hover:text-danger"
                >
                  <XIcon size={13} /> Revoke
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
