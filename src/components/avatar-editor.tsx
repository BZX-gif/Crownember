"use client";

import { useRef, useState } from "react";

export function AvatarEditor({ userId, username, currentUrl }: { userId: number; username: string; currentUrl?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(currentUrl);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function upload(file: File) {
    setMessage("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setMessage("Use JPG, PNG or WebP.");
    if (file.size > 1024 * 1024) return setMessage("Image must be under 1 MB.");
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      const form = new FormData();
      form.append("avatar", file);
      const response = await fetch("/api/profile/avatar", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Upload failed.");
      setPreview(`/api/profile/avatar/${userId}?v=${Date.now()}`);
      setMessage("Profile picture updated.");
    } catch (error) {
      setPreview(currentUrl);
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/profile/avatar", { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not remove picture.");
      setPreview(undefined);
      setMessage("Profile picture removed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not remove picture."); }
    finally { setBusy(false); }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input ref={inputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.currentTarget.value = ""; }} />
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs font-bold text-orange-300 hover:bg-orange-500/20 disabled:opacity-50">
        {busy ? "Updating…" : preview ? "Change picture" : "Add picture"}
      </button>
      {preview && <button type="button" disabled={busy} onClick={() => void remove()} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-400 hover:bg-white/5 disabled:opacity-50">Remove</button>}
      <span className="text-[11px] text-slate-500">{message || `${username}'s picture · max 1 MB`}</span>
    </div>
  );
}
