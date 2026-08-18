"use client";

import { useRef, useState } from "react";

export function AvatarEditor({ username, avatarUrl }: { username: string; avatarUrl?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(avatarUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function choose(file?: File) {
    if (!file) return;
    setError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setError("Use JPG, PNG or WebP.");
    if (file.size > 1024 * 1024) return setError("Image must be under 1 MB.");
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      const form = new FormData();
      form.append("avatar", file);
      const res = await fetch("/api/profile/avatar", { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Upload failed");
      setPreview(`/api/profile/avatar?username=${encodeURIComponent(username)}&v=${Date.now()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setPreview(avatarUrl);
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/profile/avatar", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not remove picture");
      setPreview(undefined);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not remove picture"); }
    finally { setBusy(false); }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs font-bold text-orange-300 hover:bg-orange-500/20 disabled:opacity-50">
        {busy ? "Saving…" : preview ? "Change picture" : "Add picture"}
      </button>
      {preview && <button type="button" disabled={busy} onClick={remove} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white disabled:opacity-50">Remove</button>}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
