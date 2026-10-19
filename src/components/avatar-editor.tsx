"use client";

import { useRef, useState } from "react";
import { Avatar } from "@/components/ui";
import { useToast } from "@/components/toast";
import { Notice } from "@/components/primitives";
import { PencilIcon, XIcon } from "@/components/icons";

/**
 * Own-profile avatar: one client component owns both the visible photo and the
 * upload controls, so a successful upload is reflected immediately instead of
 * waiting for a server round-trip or a stale cache.
 */
export function EditableAvatar({
  username,
  size,
  dev,
  initialUrl,
}: {
  username: string;
  size: number;
  dev: boolean;
  initialUrl?: string;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | undefined>(initialUrl);
  const [hasImage, setHasImage] = useState(Boolean(initialUrl));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function choose(file?: File) {
    if (!file) return;
    setError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > 1024 * 1024) {
      setError("Images must be under 1 MB.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("avatar", file);
      const res = await fetch("/api/profile/avatar", { method: "POST", body: form });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Upload failed.");
      }
      setUrl(`/api/profile/avatar?username=${encodeURIComponent(username)}&v=${Date.now()}`);
      setHasImage(true);
      toast({ title: "Profile photo updated", variant: "success" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Upload failed.";
      setError(message);
      toast({ title: "Could not update photo", description: message, variant: "danger" });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/profile/avatar", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not remove the photo.");
      setUrl(undefined);
      setHasImage(false);
      toast({ title: "Profile photo removed", variant: "success" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not remove the photo.";
      setError(message);
      toast({ title: "Could not remove photo", description: message, variant: "danger" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start">
      <div className="relative">
        <Avatar
          name={username}
          size={size}
          dev={dev}
          avatarUrl={hasImage ? url : undefined}
          decorative={false}
          loading="eager"
        />

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => void choose(e.target.files?.[0])}
          aria-label="Upload profile photo"
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label={hasImage ? "Change profile photo" : "Add a profile photo"}
          title={hasImage ? "Change profile photo" : "Add a profile photo"}
          className="absolute -bottom-0.5 right-0 flex h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-elevated text-muted shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-colors hover:bg-white/[0.12] hover:text-fg disabled:opacity-60"
        >
          {busy ? (
            <span className="spinner h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <PencilIcon size={13} />
          )}
        </button>

        {hasImage && !busy && (
          <button
            type="button"
            onClick={() => void remove()}
            aria-label="Remove profile photo"
            title="Remove profile photo"
            className="absolute -right-0.5 top-0 flex h-6 w-6 items-center justify-center rounded-full border border-line-strong bg-elevated text-subtle shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-colors hover:bg-white/[0.12] hover:text-danger"
          >
            <XIcon size={11} />
          </button>
        )}
      </div>

      {error && (
        <Notice className="mt-2.5" variant="error">
          {error}
        </Notice>
      )}
    </div>
  );
}
