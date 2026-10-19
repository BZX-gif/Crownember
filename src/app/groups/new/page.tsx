import Link from "next/link";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { FREE_MEMBER_LIMIT } from "@/lib/groups/limits";
import { CreateGroupForm } from "./create-group-form";
import { PageHeader, buttonClass } from "@/components/primitives";
import { LockIcon, ShieldIcon, UsersIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New group",
  robots: { index: false, follow: false },
};

export default async function NewGroupPage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <div className="page-shell max-w-xl py-16 sm:py-20">
        <div className="rounded-xl border border-line bg-panel p-8 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-line text-muted">
            <LockIcon size={18} />
          </span>
          <h1 className="display-title mt-5 text-3xl text-fg">Sign in to create a group</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
            Every group has one accountable owner, so creating one requires a
            real VYRON account.
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

  return (
    <div className="page-shell py-9 sm:py-12">
      <PageHeader
        eyebrow="Groups"
        title="Create a private group"
        description="A closed circle with one owner, invitation-only membership and nothing discoverable from outside."
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="rounded-xl border border-line bg-panel p-5">
          <CreateGroupForm freeMemberLimit={FREE_MEMBER_LIMIT} />
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-line bg-panel p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-fg">
              <LockIcon size={13} /> Private by default
            </p>
            <ul className="mt-2.5 space-y-2 text-[11px] leading-relaxed text-muted">
              <li>Only members can open the group, its member list or its picture.</li>
              <li>A guessed group id answers exactly like a group that never existed.</li>
              <li>Nothing here is indexed, shared or previewed outside the group.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-line bg-panel p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-fg">
              <UsersIcon size={13} /> {FREE_MEMBER_LIMIT} members, you included
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Two steps keep it tight: a member proposes someone, an owner or
              admin approves, and only then can that person accept. A full group
              refuses new joins even if two accept at the same moment.
            </p>
          </div>
          <div className="rounded-xl border border-line p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-fg">
              <ShieldIcon size={13} /> Roles
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Owner: everything, including transfer and deletion. Admins: only
              the capabilities you grant them. Members: participate and propose
              invitations.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
