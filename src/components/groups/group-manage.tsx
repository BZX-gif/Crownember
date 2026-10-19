"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button, Field, Input, Notice, Textarea, buttonClass } from "@/components/primitives";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { GroupAvatar, groupPictureUrl } from "@/components/group-avatar";
import { jsonInit, useGroupAction } from "@/components/use-group-action";
import { useToast } from "@/components/toast";
import { PencilIcon, PlusIcon, TrashIcon, UserIcon, XIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { GroupCapabilities } from "@/lib/groups/permissions";
import {
  MAX_GROUP_DESCRIPTION,
  MAX_GROUP_NAME,
  MIN_GROUP_NAME,
} from "@/lib/groups/limits";
import { MAX_INVITATION_MESSAGE } from "@/lib/groups/invitations";

/**
 * The owner/admin control surface for one group.
 *
 * Capabilities are decided on the server and passed down; they only choose what
 * to RENDER. Every action re-checks the same permission server-side, so this
 * component being bypassed (or its props being edited in devtools) changes
 * nothing but the error message the actor receives.
 */
export interface GroupMemberOption {
  userId: number;
  username: string;
  role: "owner" | "admin" | "member";
}

type DialogKind = "edit" | "invite" | "leave" | "transfer" | "delete" | null;

export function GroupManagePanel({
  group,
  capabilities,
  myUserId,
  members,
  memberLimitLabel,
  pictureVersion,
}: {
  group: { id: number; name: string; description: string; hasPicture: boolean };
  capabilities: GroupCapabilities;
  myUserId: number;
  members: GroupMemberOption[];
  memberLimitLabel: string;
  pictureVersion?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { busy, error, call, clearError } = useGroupAction();
  const [dialog, setDialog] = useState<DialogKind>(null);

  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [invitee, setInvitee] = useState("");
  const [note, setNote] = useState("");
  const [targetUserId, setTargetUserId] = useState<number | null>(null);
  /** Cache-buster for the picture <img>; an ETag alone will not repaint it. */
  const [pictureKey, setPictureKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const transferTargets = members.filter(
    (member) => member.userId !== myUserId && member.role !== "owner",
  );

  function open(kind: DialogKind) {
    clearError();
    if (kind === "edit") {
      setName(group.name);
      setDescription(group.description);
    }
    if (kind === "invite") {
      setInvitee("");
      setNote("");
    }
    if (kind === "transfer") setTargetUserId(null);
    setDialog(kind);
  }

  async function saveDetails() {
    const trimmed = name.trim();
    if (trimmed.length < MIN_GROUP_NAME) return;
    const result = await call(
      "edit",
      `/api/groups/${group.id}`,
      jsonInit("PATCH", { name: trimmed, description: description.trim() }),
      { title: "Group updated" },
    );
    if (result) setDialog(null);
  }

  async function sendInvitation() {
    const username = invitee.trim();
    if (!username) return;
    const result = await call<{ invitation?: { id: number } }>(
      "invite",
      `/api/groups/${group.id}/invitations`,
      jsonInit("POST", { username, message: note.trim() }),
      { title: "Invitation proposed", description: "An owner or admin reviews it next." },
    );
    if (result?.invitation) {
      setInvitee("");
      setNote("");
      setDialog(null);
    }
  }

  async function uploadPicture(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast({ title: "Unsupported file", description: "Use a JPG, PNG or WebP image.", variant: "danger" });
      return;
    }
    const form = new FormData();
    form.append("picture", file);
    const result = await call(
      "picture",
      `/api/groups/${group.id}/picture`,
      { method: "POST", body: form },
      { title: "Group picture updated" },
    );
    if (result) setPictureKey((key) => key + 1);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function removePicture() {
    const result = await call("picture-remove", `/api/groups/${group.id}/picture`, jsonInit("DELETE"), {
      title: "Group picture removed",
    });
    if (result) setPictureKey((key) => key + 1);
  }

  async function leave() {
    const result = await call("leave", `/api/groups/${group.id}/leave`, jsonInit("POST"), {
      title: "You left the group",
    });
    if (result) {
      setDialog(null);
      router.push("/groups");
      router.refresh();
    }
  }

  async function transfer() {
    if (!targetUserId) return;
    const result = await call("transfer", `/api/groups/${group.id}/transfer`, jsonInit("POST", { userId: targetUserId }), {
      title: "Ownership transferred",
      description: "You stay on as an admin.",
    });
    if (result) {
      setDialog(null);
      router.refresh();
    }
  }

  async function destroy() {
    const result = await call<{ ok?: boolean }>("delete", `/api/groups/${group.id}`, jsonInit("DELETE"), {
      title: "Group deleted",
    });
    if (result?.ok) {
      setDialog(null);
      router.push("/groups");
      router.refresh();
    }
  }

  return (
    <section aria-labelledby="group-manage-heading" className="rounded-xl border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 id="group-manage-heading" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Manage
        </h2>
        <p className="mono-meta">{memberLimitLabel}</p>
      </div>

      <div className="flex flex-wrap gap-2 px-4 py-3.5">
        {capabilities.updateDetails && (
          <Button variant="secondary" size="sm" onClick={() => open("edit")}>
            <PencilIcon size={14} /> Edit details
          </Button>
        )}
        {capabilities.invite && (
          <Button variant="primary" size="sm" onClick={() => open("invite")}>
            <PlusIcon size={14} /> Invite member
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => open("leave")} disabled={capabilities.isOwner}>
          <XIcon size={14} /> Leave group
        </Button>
        {capabilities.transferOwnership && (
          <Button variant="secondary" size="sm" onClick={() => open("transfer")} disabled={transferTargets.length === 0}>
            <UserIcon size={14} /> Transfer ownership
          </Button>
        )}
        {capabilities.deleteGroup && (
          <Button variant="danger" size="sm" onClick={() => open("delete")}>
            <TrashIcon size={14} /> Delete group
          </Button>
        )}
      </div>

      {capabilities.updateDetails && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3.5">
          <GroupAvatar
            name={group.name}
            pictureUrl={
              group.hasPicture
                ? groupPictureUrl(group.id, `${pictureVersion ?? "0"}-${pictureKey}`)
                : undefined
            }
            size={44}
            square
            decorative={false}
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-fg">Group picture</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
              JPG, PNG or WebP up to 1 MB. Contents are verified by signature — a
              renamed file is rejected.
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            id="group-picture-upload"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => void uploadPicture(event.target.files?.[0])}
          />
          <div className="flex gap-2">
            <label
              htmlFor="group-picture-upload"
              className={cn(buttonClass("secondary", "sm"), "cursor-pointer")}
            >
              {busy === "picture" ? <span className="spinner" aria-hidden="true" /> : <PencilIcon size={14} />}
              {group.hasPicture ? "Replace" : "Upload"}
            </label>
            {group.hasPicture && (
              <Button
                variant="ghost"
                size="sm"
                loading={busy === "picture-remove"}
                onClick={() => void removePicture()}
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      )}

      {capabilities.isOwner && (
        <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-subtle">
          Owners cannot leave their own group — transfer ownership or delete it.
          Premium capacity is granted by VYRON staff, never purchased in-app.
        </p>
      )}

      {error && (
        <div className="px-4 pb-4">
          <Notice variant="error">{error}</Notice>
        </div>
      )}

      {/* ---- Edit details ---- */}
      {dialog === "edit" && (
        <ModalShell title="Edit group details" onClose={() => setDialog(null)}>
          <div className="space-y-4">
            <Field
              label="Group name"
              htmlFor="edit-group-name"
              hint={`${name.trim().length}/${MAX_GROUP_NAME} characters`}
            >
              <Input
                id="edit-group-name"
                value={name}
                maxLength={MAX_GROUP_NAME}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field
              label="Description"
              htmlFor="edit-group-description"
              optional
              hint={`${description.length}/${MAX_GROUP_DESCRIPTION} characters`}
            >
              <Textarea
                id="edit-group-description"
                value={description}
                maxLength={MAX_GROUP_DESCRIPTION}
                rows={4}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="md" onClick={() => setDialog(null)} disabled={busy !== null}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                loading={busy === "edit"}
                disabled={name.trim().length < MIN_GROUP_NAME}
                onClick={() => void saveDetails()}
              >
                Save changes
              </Button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* ---- Invite ---- */}
      {dialog === "invite" && (
        <ModalShell title="Propose an invitation" onClose={() => setDialog(null)}>
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-muted">
              Anyone you propose is reviewed by an owner or admin before the
              invitation is actually sent. Being proposed never adds someone to
              the group.
            </p>
            <Field label="Username" htmlFor="invite-username" hint="Exact username, 3–16 characters.">
              <Input
                id="invite-username"
                value={invitee}
                onChange={(event) => setInvitee(event.target.value.replace(/\s/g, "").slice(0, 16))}
                placeholder="miraQA"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </Field>
            <Field
              label="Note"
              htmlFor="invite-note"
              optional
              hint={`${note.length}/${MAX_INVITATION_MESSAGE} characters`}
            >
              <Textarea
                id="invite-note"
                value={note}
                rows={3}
                maxLength={MAX_INVITATION_MESSAGE}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Why should they be in this group?"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="md" onClick={() => setDialog(null)} disabled={busy !== null}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                loading={busy === "invite"}
                disabled={invitee.trim().length < 3}
                onClick={() => void sendInvitation()}
              >
                Propose invitation
              </Button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* ---- Leave ---- */}
      <ConfirmDialog
        open={dialog === "leave"}
        title="Leave this group?"
        description="You will lose access to everything inside it immediately. Rejoining needs a new invitation and a new approval."
        confirmLabel="Leave group"
        busy={busy === "leave"}
        onConfirm={() => void leave()}
        onClose={() => setDialog(null)}
      />

      {/* ---- Transfer ---- */}
      {dialog === "transfer" && (
        <ModalShell title="Transfer ownership" onClose={() => setDialog(null)}>
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-muted">
              The new owner gains full control, including deleting the group and
              removing you. You stay on as an admin.
            </p>
            <fieldset>
              <legend className="mb-2 text-xs font-medium text-muted">New owner</legend>
              <div className="nice-scroll max-h-56 space-y-1 overflow-y-auto rounded-lg border border-line bg-raised p-1.5">
                {transferTargets.map((member) => (
                  <label
                    key={member.userId}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors",
                      targetUserId === member.userId ? "bg-white/[0.08] text-fg" : "text-muted hover:bg-white/[0.04]",
                    )}
                  >
                    <input
                      type="radio"
                      name="transfer-target"
                      className="h-3.5 w-3.5 accent-white"
                      checked={targetUserId === member.userId}
                      onChange={() => setTargetUserId(member.userId)}
                    />
                    <span className="truncate">{member.username}</span>
                    <span className="mono-meta ml-auto">{member.role}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="md" onClick={() => setDialog(null)} disabled={busy !== null}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                loading={busy === "transfer"}
                disabled={!targetUserId}
                onClick={() => void transfer()}
              >
                Transfer ownership
              </Button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* ---- Delete ---- */}
      <ConfirmDialog
        open={dialog === "delete"}
        title="Delete this group?"
        description={`"${group.name}" and everything in it — members, invitations and history — is removed permanently. There is no undo.`}
        confirmLabel="Delete forever"
        requirePhrase={group.name}
        busy={busy === "delete"}
        onConfirm={() => void destroy()}
        onClose={() => setDialog(null)}
      />
    </section>
  );
}

/** A lightweight modal frame for forms (destructive flows use ConfirmDialog). */
export function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-fade-in nice-scroll relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-xl border border-line-strong bg-elevated p-5 shadow-[0_30px_80px_rgba(0,0,0,0.7)]"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold text-fg">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-subtle transition-colors hover:bg-white/[0.06] hover:text-fg"
          >
            <XIcon size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
