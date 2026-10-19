import Link from "next/link";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { listGroupsForUser, listMyGroupInvitations } from "@/lib/groups/service";
import { FREE_MEMBER_LIMIT } from "@/lib/groups/limits";
import { GroupAvatar, groupPictureUrl } from "@/components/group-avatar";
import { GroupInvitationInbox } from "@/components/groups/invitation-inbox";
import { EmptyState, PageHeader, buttonClass } from "@/components/primitives";
import { LockIcon, PlusIcon, ShieldIcon, UsersIcon } from "@/components/icons";
import { cn, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Groups",
  description: "Your private groups on VYRON.",
  // Private surfaces are never indexed, and their titles must not leak into a
  // search result or a browser history preview beyond the member's own device.
  robots: { index: false, follow: false },
};

const ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "Member" } as const;

export default async function GroupsPage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <div className="page-shell max-w-xl py-16 sm:py-20">
        <div className="rounded-xl border border-line bg-panel p-8 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-line text-muted">
            <LockIcon size={18} />
          </span>
          <h1 className="display-title mt-5 text-3xl text-fg">Groups are private</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
            A group is a closed circle: its name, its members and everything
            inside it stay invisible to anyone who is not in it. Sign in to see
            yours.
          </p>
          <div className="mt-6 flex justify-center gap-2.5">
            <Link href="/login" className={buttonClass("secondary", "md")}>
              Sign in
            </Link>
            <Link href="/register" className={buttonClass("primary", "md")}>
              Join VYRON
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const [items, invitations] = await Promise.all([
    listGroupsForUser(user.id),
    listMyGroupInvitations(user.id),
  ]);

  return (
    <div className="page-shell py-9 pb-24 sm:py-12 md:pb-12">
      <PageHeader
        eyebrow="Groups"
        title="Your private circles."
        description="Small, closed groups for the people you actually play with. Nothing here is discoverable from outside."
        action={
          <Link href="/groups/new" className={buttonClass("primary", "md")}>
            <PlusIcon size={15} /> New group
          </Link>
        }
      />

      <div className="mt-8 space-y-6">
        <GroupInvitationInbox
          invitations={invitations.map((invitation) => ({
            id: invitation.id,
            groupId: invitation.groupId,
            groupName: invitation.groupName ?? "Private group",
            hasPicture: Boolean(invitation.hasPicture),
            status: invitation.status,
            message: invitation.message,
            invitedByUsername: invitation.invitedByUsername,
            expiresAt: invitation.expiresAt.toISOString(),
            approvedAt: invitation.approvedAt ? invitation.approvedAt.toISOString() : null,
          }))}
        />

        {items.length === 0 ? (
          <EmptyState
            icon={<UsersIcon size={18} />}
            title="No groups yet"
            description={`Create one and you become its owner. Free groups hold up to ${FREE_MEMBER_LIMIT} members, you included, and every join is invitation plus approval.`}
            action={
              <Link href="/groups/new" className={buttonClass("primary", "md")}>
                <PlusIcon size={15} /> Create a private group
              </Link>
            }
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {items.map((group) => (
              <li key={group.id}>
                <Link
                  href={`/groups/${group.id}`}
                  className="group flex h-full items-start gap-3.5 rounded-xl border border-line bg-panel p-4 transition-colors hover:border-line-strong"
                >
                  <GroupAvatar
                    name={group.name}
                    pictureUrl={group.hasPicture ? groupPictureUrl(group.id, group.pictureVersion) : undefined}
                    size={46}
                    square
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-fg group-hover:underline">
                        {group.name}
                      </p>
                      <span
                        className={cn(
                          "inline-flex h-5 shrink-0 items-center rounded-full border px-1.5 text-[11px] font-medium",
                          group.role === "owner"
                            ? "border-line-strong bg-white/[0.08] text-fg"
                            : "border-line text-subtle",
                        )}
                      >
                        {ROLE_LABEL[group.role]}
                      </span>
                    </div>
                    {group.description && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted wrap-anywhere">
                        {group.description}
                      </p>
                    )}
                    <p className="mono-meta mt-2 flex flex-wrap items-center gap-x-2">
                      <span>
                        {group.memberCount} of {group.memberLimit} seats
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Created {formatDate(group.createdAt)}</span>
                      {group.pendingReviewCount ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 text-fg">
                            <ShieldIcon size={11} />
                            {group.pendingReviewCount} to review
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
