"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  Button,
  Field,
  Input,
  Notice,
  Textarea,
} from "@/components/primitives";
import { GroupAvatar } from "@/components/group-avatar";
import { PencilIcon, XIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import {
  MAX_GROUP_DESCRIPTION,
  MAX_GROUP_NAME,
  MIN_GROUP_NAME,
} from "@/lib/groups/limits";

/**
 * Create a group. One request, one round trip: the picture is sent inline as a
 * data URL and the server validates it by magic bytes (see lib/images.ts) —
 * the browser's claimed type is never trusted.
 */
export function CreateGroupForm({ freeMemberLimit }: { freeMemberLimit: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [picture, setPicture] = useState<{ dataUrl: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function choosePicture(file?: File) {
    if (!file) return;
    setError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Use a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > 512 * 1024) {
      setError("Keep the picture under 512 KB — you can replace it after creating the group.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("That file could not be read."));
      reader.readAsDataURL(file);
    }).catch((e: Error) => {
      setError(e.message);
      return "";
    });
    if (dataUrl) setPicture({ dataUrl, name: file.name });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (trimmed.length < MIN_GROUP_NAME) {
      setError(`Give the group a name of at least ${MIN_GROUP_NAME} characters.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          description: description.trim(),
          picture: picture?.dataUrl ?? null,
        }),
      });
      const data = (await res.json()) as { group?: { id: number }; error?: string };
      if (!res.ok || !data.group) {
        setError(data.error ?? "The group could not be created. Try again.");
        return;
      }
      toast({ title: "Group created", description: "You are its owner.", variant: "success" });
      router.push(`/groups/${data.group.id}`);
      router.refresh();
    } catch {
      setError("Network error — the group was not created.");
    } finally {
      setBusy(false);
    }
  }

  const trimmedLength = name.trim().length;

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="relative">
          <GroupAvatar name={name.trim() || "New group"} pictureUrl={picture?.dataUrl} size={64} square decorative={false} />
          <input
            ref={fileRef}
            id="group-picture"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => void choosePicture(event.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label={picture ? "Change group picture" : "Add a group picture"}
            title={picture ? "Change group picture" : "Add a group picture"}
            className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-line-strong bg-elevated text-muted transition-colors hover:bg-white/[0.12] hover:text-fg"
          >
            <PencilIcon size={12} />
          </button>
          {picture && (
            <button
              type="button"
              onClick={() => {
                setPicture(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
              aria-label="Remove group picture"
              title="Remove group picture"
              className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-line-strong bg-elevated text-subtle transition-colors hover:text-danger"
            >
              <XIcon size={11} />
            </button>
          )}
        </div>
        <div className="min-w-0 text-xs leading-relaxed text-muted">
          <p className="font-medium text-fg">Group picture</p>
          <p className="mt-1">
            Optional. JPG, PNG or WebP up to 512 KB here, 1 MB after creation. The
            file&rsquo;s real contents are checked, not just its name.
          </p>
          {picture && <p className="mono-meta mt-1.5 truncate">{picture.name}</p>}
        </div>
      </div>

      <Field
        label="Group name"
        htmlFor="group-name"
        hint={`${trimmedLength}/${MAX_GROUP_NAME} characters`}
        error={
          trimmedLength > 0 && trimmedLength < MIN_GROUP_NAME
            ? `Use at least ${MIN_GROUP_NAME} characters.`
            : undefined
        }
      >
        <Input
          id="group-name"
          value={name}
          onChange={(event) => setName(event.target.value.slice(0, MAX_GROUP_NAME))}
          placeholder="Midnight Ranked Squad"
          maxLength={MAX_GROUP_NAME}
          autoComplete="off"
          autoFocus
          required
        />
      </Field>

      <Field
        label="Description"
        htmlFor="group-description"
        optional
        hint={`${description.length}/${MAX_GROUP_DESCRIPTION} characters`}
      >
        <Textarea
          id="group-description"
          value={description}
          onChange={(event) => setDescription(event.target.value.slice(0, MAX_GROUP_DESCRIPTION))}
          placeholder="What is this group for, and who belongs in it?"
          maxLength={MAX_GROUP_DESCRIPTION}
          rows={4}
        />
      </Field>

      {error && <Notice variant="error">{error}</Notice>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" size="md" loading={busy}>
          Create private group
        </Button>
        <p className="text-xs text-subtle">
          You become the owner · up to {freeMemberLimit} members
        </p>
      </div>
    </form>
  );
}
