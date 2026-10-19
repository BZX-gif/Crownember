"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/primitives";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { GroupAvatar } from "@/components/group-avatar";
import { jsonInit, useGroupAction } from "@/components/use-group-action";
import { CheckIcon, LockIcon, XIcon } from "@/components/icons";
import { formatDate } from "@/lib/utils";
import { MAX_INVITATION_MESSAGE } from "@/lib/groups/invitations";

export interface InboxInvitation {
  id: number;
  groupId: number;
  groupName: string;
  hasPicture: boolean;
  status: string;
  message: string;
  invitedByUsername?: string;
  expiresAt: string;
  approvedAt: string | null;
}

/**
 * The invitee's side of the flow. Only approved invitations addressed to this
 * member ever arrive here — the API filters by session user and by status,
 * never by a client-supplied id, so a proposal that no manager has approved is
 * invisible to the person proposed. Accepting re-checks everything server-side.
 */
export function GroupInvitationInbox({ invitations }: { invitations: InboxInvitation[] }) {
  const router = useRouter();
  const { busy, call } = useGroupAction();
  const [declining, setDeclining] = useState<InboxInvitation | null>(null);
  const [hidden, setHidden] = useState<number[]>([]);

  // The API only ever returns invitations that were approved and addressed to
  // this member, so nothing here needs a second privacy filter.
  const visible = invitations.filter((invitation) => !hidden.includes(invitation.id));
  if (visible.length === 0) return null;

  async function accept(invitation: InboxInvitation) {
    const result = await call<{ groupId?: number }>(
      `accept-${invitation.id}`,
      `/api/groups/invitations/${invitation.id}/accept`,
      jsonInit("POST"),
      { title: `You joined ${invitation.groupName}`, refresh: false },
    );
    if (result?.groupId) {
      router.push(`/groups/${result.groupId}`);
      router.refresh();
    }
  }

  async function decline(invitation: InboxInvitation) {
    const result = await call(
      `decline-${invitation.id}`,
      `/api/groups/invitations/${invitation.id}/decline`,
      jsonInit("POST"),
      { title: "Invitation declined" },
    );
    if (result) {
      setDeclining(null);
      setHidden((current) => [...current, invitation.id]);
    }
  }

  return (
    <section aria-labelledby="group-invites-heading" className="rounded-xl border border-line bg-panel">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <LockIcon size={14} className="text-muted" />
        <h2 id="group-invites-heading" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Your group invitations
        </h2>
      </div>

      <ul className="divide-y divide-line">
        {visible.map((invitation) => (
          <li key={invitation.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
            {/* No picture URL: the picture route is members-only, and this
                member is not one yet. The initials tile is the honest state. */}
            <GroupAvatar name={invitation.groupName} size={40} square decorative={false} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-fg">{invitation.groupName}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">
                Invited by {invitation.invitedByUsername ?? "a member"}
                {invitation.approvedAt ? ` · approved ${formatDate(invitation.approvedAt)}` : ""}
                {" · "}expires {formatDate(invitation.expiresAt)}
              </p>
              {invitation.message && (
                <p className="mt-1.5 line-clamp-2 rounded-lg border border-line bg-white/[0.02] px-2.5 py-1.5 text-xs leading-relaxed text-muted wrap-anywhere">
                  {invitation.message.slice(0, MAX_INVITATION_MESSAGE)}
                </p>
              )}
            </div>
            <div className="flex gap-1.5">
              <Button
                variant="primary"
                size="sm"
                loading={busy === `accept-${invitation.id}`}
                onClick={() => void accept(invitation)}
              >
                <CheckIcon size={14} /> Accept
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDeclining(invitation)}>
                <XIcon size={14} /> Decline
              </Button>
            </div>
          </li>
        ))}

      </ul>

      <ConfirmDialog
        open={declining !== null}
        title={`Decline ${declining?.groupName ?? "this invitation"}?`}
        description="You will not join, and the group is not told why. They would need to invite you again."
        confirmLabel="Decline invitation"
        busy={busy === `decline-${declining?.id ?? -1}`}
        onConfirm={() => declining && void decline(declining)}
        onClose={() => setDeclining(null)}
      />
    </section>
  );
}
