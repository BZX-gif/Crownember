"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui";
import { Button } from "@/components/primitives";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { jsonInit, useGroupAction } from "@/components/use-group-action";
import { ShieldIcon, TrashIcon, UserIcon } from "@/components/icons";
import { avatarUrlFor, cn, formatDate } from "@/lib/utils";
import type { GroupCapabilities } from "@/lib/groups/permissions";
import { ADMIN_GRANTABLE_PERMISSIONS } from "@/lib/groups/permissions";
import { ModalShell } from "@/components/groups/group-manage";

export interface MemberRowData {
  userId: number;
  username: string;
  bio: string;
  avatarColor: string;
  avatarMime: string | null;
  role: "owner" | "admin" | "member";
  permissions: string[];
  joinedAt: string;
}

const PERMISSION_LABELS: Record<string, string> = {
  updateDetails: "Edit details and picture",
  invite: "Propose invitations",
  reviewInvitations: "Approve or reject invitations",
  manageMembers: "Remove members below your role",
  manageEvents: "Manage events and announcements",
  moderate: "Moderate members and content",
  viewAuditLog: "View the audit log",
};

const ROLE_STYLES = {
  owner: "border-line-strong bg-white/[0.08] text-fg",
  admin: "border-line bg-white/[0.04] text-muted",
  member: "border-line bg-transparent text-subtle",
} as const;

/**
 * One member row. The controls it renders come from server-computed
 * capabilities plus the rank rule; the server repeats every check, so an
 * edited prop only ever produces a 404.
 */
export function GroupMemberRow({
  groupId,
  member,
  isSelf,
  capabilities,
  myRole,
}: {
  groupId: number;
  member: MemberRowData;
  isSelf: boolean;
  capabilities: GroupCapabilities;
  myRole: "owner" | "admin" | "member";
}) {
  const { busy, call } = useGroupAction();
  const [confirm, setConfirm] = useState<"remove" | "demote" | null>(null);
  const [tuning, setTuning] = useState(false);
  const [granted, setGranted] = useState<string[]>(member.permissions);

  const roleRank = { member: 0, admin: 1, owner: 2 } as const;
  const outranks = roleRank[myRole] > roleRank[member.role];
  const canRemove = Boolean(capabilities.manageMembers) && outranks && !isSelf && member.role !== "owner";
  // Promoting someone to ADMIN is manageAdmins (owner-only) — the server
  // refuses it from an admin, so the button must not be offered either.
  const canPromote = Boolean(capabilities.manageAdmins) && outranks && member.role === "member";
  const canDemote = Boolean(capabilities.manageAdmins) && outranks && member.role === "admin";
  const canTune = Boolean(capabilities.manageAdmins) && member.role === "admin";

  async function remove() {
    const result = await call(
      "remove",
      `/api/groups/${groupId}/members/${member.userId}`,
      jsonInit("DELETE"),
      { title: `${member.username} removed` },
    );
    if (result) setConfirm(null);
  }

  async function changeRole(role: "admin" | "member") {
    const result = await call(
      "role",
      `/api/groups/${groupId}/members/${member.userId}/role`,
      jsonInit("PATCH", { role }),
      { title: role === "admin" ? `${member.username} is now an admin` : `${member.username} is now a member` },
    );
    if (result) setConfirm(null);
  }

  async function savePermissions() {
    const result = await call(
      "permissions",
      `/api/groups/${groupId}/members/${member.userId}/role`,
      jsonInit("PATCH", { permissions: granted }),
      { title: "Admin permissions updated" },
    );
    if (result) setTuning(false);
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 row-hover">
      <Avatar
        name={member.username}
        size={36}
        avatarUrl={avatarUrlFor({ username: member.username, avatarMime: member.avatarMime })}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/players/${encodeURIComponent(member.username)}`}
            className="truncate text-sm font-medium text-fg hover:underline"
          >
            {member.username}
          </a>
          <span
            className={cn(
              "inline-flex h-5 items-center rounded-full border px-1.5 text-[11px] font-medium capitalize",
              ROLE_STYLES[member.role],
            )}
          >
            {member.role}
          </span>
          {isSelf && <span className="mono-meta">you</span>}
        </div>
        <p className="mono-meta mt-0.5">
          Joined {formatDate(member.joinedAt)}
          {member.role === "admin" && member.permissions.length > 0 && (
            <> · {member.permissions.length} permission{member.permissions.length === 1 ? "" : "s"}</>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {canTune && (
          <Button variant="ghost" size="xs" onClick={() => { setGranted(member.permissions); setTuning(true); }}>
            <ShieldIcon size={13} /> Permissions
          </Button>
        )}
        {canPromote && (
          <Button variant="secondary" size="xs" loading={busy === "role"} onClick={() => void changeRole("admin")}>
            <ShieldIcon size={13} /> Make admin
          </Button>
        )}
        {canDemote && (
          <Button variant="secondary" size="xs" loading={busy === "role"} onClick={() => setConfirm("demote")}>
            <UserIcon size={13} /> Demote
          </Button>
        )}
        {canRemove && (
          <Button variant="ghost" size="xs" onClick={() => setConfirm("remove")} className="hover:text-danger">
            <TrashIcon size={13} /> Remove
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirm === "remove"}
        title={`Remove ${member.username}?`}
        description="They lose access to the group immediately. Any invitation waiting for them is withdrawn, and returning needs a new invitation and approval."
        confirmLabel="Remove member"
        busy={busy === "remove"}
        onConfirm={() => void remove()}
        onClose={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm === "demote"}
        title={`Demote ${member.username}?`}
        description="They keep their membership but lose every admin capability."
        confirmLabel="Demote to member"
        busy={busy === "role"}
        onConfirm={() => void changeRole("member")}
        onClose={() => setConfirm(null)}
      />

      {tuning && (
        <ModalShell title={`${member.username} — admin permissions`} onClose={() => setTuning(false)}>
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-muted">
              Only the owner can tune these. Ownership, deletion, entitlements and
              admin management can never be granted — they stay with the owner.
            </p>
            <fieldset>
              <legend className="mb-2 text-xs font-medium text-muted">Capabilities</legend>
              <div className="space-y-1.5">
                {ADMIN_GRANTABLE_PERMISSIONS.map((permission) => {
                  const id = `perm-${permission}`;
                  const checked = granted.includes(permission);
                  return (
                    <label
                      key={permission}
                      htmlFor={id}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors",
                        checked ? "border-line-strong bg-white/[0.05]" : "border-line hover:border-line-strong/70",
                      )}
                    >
                      <input
                        id={id}
                        type="checkbox"
                        className="mt-0.5 h-3.5 w-3.5 accent-white"
                        checked={checked}
                        onChange={(event) =>
                          setGranted((current) =>
                            event.target.checked
                              ? [...current, permission]
                              : current.filter((value) => value !== permission),
                          )
                        }
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] text-fg">
                          {PERMISSION_LABELS[permission] ?? permission}
                        </span>
                        <span className="mono-meta">{permission}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="md" onClick={() => setTuning(false)} disabled={busy !== null}>
                Cancel
              </Button>
              <Button variant="primary" size="md" loading={busy === "permissions"} onClick={() => void savePermissions()}>
                Save permissions
              </Button>
            </div>
          </div>
        </ModalShell>
      )}
    </li>
  );
}
