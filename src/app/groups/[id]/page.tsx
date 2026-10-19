import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireGroupPage } from "@/lib/groups/access";
import {
  countMembers,
  listGroupMembers,
  listInvitationsForReview,
  readEntitlement,
} from "@/lib/groups/service";
import { describeLimit } from "@/lib/groups/limits";
import { GroupAvatar, groupPictureUrl } from "@/components/group-avatar";
import { GroupManagePanel } from "@/components/groups/group-manage";
import { GroupMemberRow } from "@/components/groups/member-row";
import { GroupInvitationReview } from "@/components/groups/invitation-review";
import { EmptyState, PageHeader, buttonClass } from "@/components/primitives";
import { ArrowLeftIcon, LockIcon, UsersIcon } from "@/components/icons";
import { avatarVersion, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * A private group is never described in metadata: the document title, the OG
 * tags and the description are all generic, and the page is not indexable.
 * Otherwise a shared link, a browser tab strip or a crawler would disclose the
 * group's name — and therefore its members' activity — to outsiders.
 */
export const metadata: Metadata = {
  title: "Private group",
  robots: { index: false, follow: false },
};

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const groupId = Number(id);
  if (!Number.isInteger(groupId) || groupId <= 0) notFound();

  // The single authorization door. A non-member, a signed-out visitor and a
  // guessed id all land on VYRON's ordinary 404 — the same page a deleted group
  // gets, so nothing about existence is disclosed.
  const access = await requireGroupPage({ groupId, permission: "viewContent" });

  const [memberCount, entitlement, members] = await Promise.all([
    countMembers(groupId),
    readEntitlement(groupId),
    listGroupMembers(groupId),
  ]);
  const limitLabel = describeLimit({
    maxMembers: access.group.maxMembers,
    tier: entitlement?.tier ?? null,
    memberLimit: entitlement?.memberLimit ?? null,
  });
  const review = access.capabilities.reviewInvitations
    ? await listInvitationsForReview(access)
    : null;
  const invitations = review?.ok
    ? review.data.map((invitation) => ({
        id: invitation.id,
        status: invitation.status,
        message: invitation.message,
        inviteeUsername: invitation.inviteeUsername ?? "member",
        invitedByUsername: invitation.invitedByUsername,
        createdAt: invitation.createdAt.toISOString(),
        expiresAt: invitation.expiresAt.toISOString(),
        approvedAt: invitation.approvedAt ? invitation.approvedAt.toISOString() : null,
      }))
    : [];

  return (
    <div className="page-shell py-7 pb-24 sm:py-10 md:pb-10">
      <Link
        href="/groups"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-fg"
      >
        <ArrowLeftIcon size={13} /> All groups
      </Link>

      <header className="mt-5 flex flex-wrap items-start gap-5">
        <GroupAvatar
          name={access.group.name}
          pictureUrl={
            access.group.pictureMime
              ? groupPictureUrl(access.group.id, avatarVersion(access.group.pictureVersion))
              : undefined
          }
          size={76}
          square
          decorative={false}
        />
        <div className="min-w-0 flex-1">
          <p className="eyebrow flex items-center gap-1.5">
            <LockIcon size={11} /> Private group
          </p>
          <h1 className="display-title mt-2 text-2xl text-fg sm:text-3xl wrap-anywhere">
            {access.group.name}
          </h1>
          {access.group.description && (
            <p className="prose-body mt-3 max-w-2xl text-sm text-muted wrap-anywhere">
              {access.group.description}
            </p>
          )}
          <p className="mono-meta mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {memberCount} member{memberCount === 1 ? "" : "s"} · {limitLabel}
            </span>
            <span aria-hidden="true">·</span>
            <span>Created {formatDate(access.group.createdAt)}</span>
            <span aria-hidden="true">·</span>
            <span>You are {access.role === "owner" ? "the owner" : `an ${access.role}`}</span>
          </p>
        </div>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="group-members-heading" className="rounded-xl border border-line bg-panel">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <h2
                id="group-members-heading"
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted"
              >
                <UsersIcon size={13} /> Members
              </h2>
              <p className="mono-meta">
                {memberCount} of {limitLabel.split(" · ")[0]}
              </p>
            </div>

            {members.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<UsersIcon size={18} />}
                  title="Nobody here yet"
                  description="Invite someone — an owner or admin approves the proposal, and only then can they accept."
                  className="border-0 py-8"
                />
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {members.map((member) => (
                  <GroupMemberRow
                    key={member.userId}
                    groupId={groupId}
                    member={{ ...member, joinedAt: member.joinedAt.toISOString() }}
                    isSelf={member.userId === access.user.id}
                    capabilities={access.capabilities}
                    myRole={access.role}
                  />
                ))}
              </ul>
            )}
          </section>

          {access.capabilities.reviewInvitations && (
            <GroupInvitationReview groupId={groupId} invitations={invitations} />
          )}
        </div>

        <aside className="space-y-6">
          <GroupManagePanel
            group={{
              id: access.group.id,
              name: access.group.name,
              description: access.group.description,
              hasPicture: Boolean(access.group.pictureMime),
            }}
            capabilities={access.capabilities}
            myUserId={access.user.id}
            members={members.map((member) => ({
              userId: member.userId,
              username: member.username,
              role: member.role,
            }))}
            memberLimitLabel={limitLabel}
            pictureVersion={avatarVersion(access.group.pictureVersion)}
          />

          <div className="rounded-xl border border-line bg-panel p-4">
            <p className="text-xs font-medium text-fg">How membership works</p>
            <ol className="mt-2.5 space-y-2 text-[11px] leading-relaxed text-muted">
              <li>1. A member proposes someone by username.</li>
              <li>2. An owner or admin approves it — that sends the invitation.</li>
              <li>3. The invited person accepts it themselves.</li>
              <li>
                4. Capacity, expiry and revocation are re-checked at the moment
                of acceptance, inside a locked transaction.
              </li>
            </ol>
            <p className="mt-3 border-t border-line pt-3 text-[11px] leading-relaxed text-subtle">
              Private group conversations arrive in a later release; this group
              is the foundation for them.
            </p>
          </div>

          {!access.capabilities.isOwner && (
            <Link href="/groups" className={buttonClass("secondary", "sm", "w-full")}>
              <ArrowLeftIcon size={14} /> Back to your groups
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
