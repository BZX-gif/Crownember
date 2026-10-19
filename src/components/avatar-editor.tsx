"use client";

import { useRef, useState } from "react";
import { Avatar } from "@/components/ui";
import { useToast } from "@/components/toast";
import { Notice, buttonClass } from "@/components/primitives";
import { TrashIcon } from "@/components/icons";

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
  initialUrl: string;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | undefined>(initialUrl);
  const [hasImage, setHasImage] = useState(true);
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
    <div>
      <Avatar
        name={username}
        size={size}
        dev={dev}
        avatarUrl={hasImage ? url : ""}
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
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={buttonClass("secondary", "sm", "h-7 px-2 text-[11px]")}
        >
          {busy ? "Saving…" : "Change photo"}
        </button>
        {hasImage && (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className={buttonClass("ghost", "sm", "h-7 px-2 text-[11px] text-subtle hover:text-danger")}
            aria-label="Remove profile photo"
          >
            <TrashIcon size={12} /> Remove
          </button>
        )}
      </div>
      {error && (
        <Notice className="mt-2" variant="error">
          {error}
        </Notice>
      )}
    </div>
  );
}
