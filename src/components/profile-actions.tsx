"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  targetUsername: string;
  relationship: "self" | "friends" | "outgoing" | "incoming" | "none";
  iBlockedThem: boolean;
  theyBlockedMe: boolean;
}

/**
 * The social control deck on every profile: friend requests, squad status,
 * a direct line to DMs, and the block seal.
 */
export function ProfileActions({
  targetUsername,
  relationship: initialRel,
  iBlockedThem: initialBlocked,
  theyBlockedMe,
}: Props) {
  const [rel, setRel] = useState(initialRel);
  const [iBlockedThem, setIBlockedThem] = useState(initialBlocked);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");

  const sealed = iBlockedThem || theyBlockedMe;

  async function call(path: string) {
    if (busy) return;
    setBusy(true);
    setFlash("");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: targetUsername }),
      });
      const d = await res.json();
      if (!res.ok) {
        setFlash(d.error ?? "Something went wrong.");
        return;
      }
      setFlash(d.message ?? "");
      return d;
    } catch {
      setFlash("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function onFriend() {
    const d = await call("/api/friends/request");
    if (d?.ok) setRel(d.autoAccepted ? "friends" : "outgoing");
  }
  async function onAccept() {
    const d = await call("/api/friends/accept");
    if (d?.ok) setRel("friends");
  }
  async function onDecline() {
    const d = await call("/api/friends/decline");
    if (d?.ok) setRel("none");
  }
  async function onRemove() {
    const d = await call("/api/friends/remove");
    if (d?.ok) setRel("none");
  }
  async function onBlock() {
    const d = await call("/api/block/toggle");
    if (d?.ok) {
      setIBlockedThem(d.blocked);
      if (d.blocked) setRel("none");
    }
  }

  if (rel === "self") return null;

  const btn =
    "px-4 py-2 font-hud text-[11px] font-bold uppercase tracking-wider transition disabled:opacity-40";

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        {iBlockedThem ? (
          <button
            onClick={onBlock}
            disabled={busy}
            className={cn(
              btn,
              "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20",
            )}
          >
            🔓 unblock
          </button>
        ) : theyBlockedMe ? (
          <span
            className={cn(btn, "border border-white/10 bg-white/5 text-slate-500")}
            title="This player sealed their presence from you"
          >
            🚫 sealed
          </span>
        ) : (
          <>
            {rel === "none" && (
              <button
                onClick={onFriend}
                disabled={busy}
                className={cn(
                  btn,
                  "clip-btn bg-gradient-to-r from-orange-500 to-amber-400 text-slate-950 hover:-translate-y-0.5 hover:brightness-110",
                )}
              >
                ⚡ add friend
              </button>
            )}
            {rel === "outgoing" && (
              <>
                <span
                  className={cn(
                    btn,
                    "border border-amber-500/40 bg-amber-500/10 text-amber-300",
                  )}
                >
                  ⏳ request sent
                </span>
                <button
                  onClick={onRemove}
                  disabled={busy}
                  className={cn(
                    btn,
                    "border border-white/10 bg-white/5 text-slate-400 hover:text-slate-200",
                  )}
                >
                  cancel
                </button>
              </>
            )}
            {rel === "incoming" && (
              <>
                <button
                  onClick={onAccept}
                  disabled={busy}
                  className={cn(
                    btn,
                    "clip-btn bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:-translate-y-0.5 hover:brightness-110",
                  )}
                >
                  🤝 accept
                </button>
                <button
                  onClick={onDecline}
                  disabled={busy}
                  className={cn(
                    btn,
                    "border border-white/10 bg-white/5 text-slate-400 hover:text-slate-200",
                  )}
                >
                  decline
                </button>
              </>
            )}
            {rel === "friends" && (
              <>
                <span
                  className={cn(
                    btn,
                    "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
                  )}
                >
                  🤝 squad
                </span>
                <button
                  onClick={onRemove}
                  disabled={busy}
                  className={cn(
                    btn,
                    "border border-white/10 bg-white/5 text-slate-400 hover:text-slate-200",
                  )}
                >
                  unfriend
                </button>
              </>
            )}
            <Link
              href={`/messages/${encodeURIComponent(targetUsername)}`}
              className={cn(
                btn,
                "clip-btn border-0 bg-white/10 text-white hover:-translate-y-0.5 hover:bg-white/20",
              )}
            >
              ✉️ message
            </Link>
            <button
              onClick={onBlock}
              disabled={busy}
              title="Block: they vanish from your screens, everywhere"
              className={cn(
                btn,
                "border border-rose-500/30 bg-rose-500/5 text-rose-400/80 hover:bg-rose-500/15 hover:text-rose-300",
              )}
            >
              🚫 block
            </button>
          </>
        )}
      </div>
      {flash && (
        <p className="mt-2 font-hud text-[11px] text-slate-400">{flash}</p>
      )}
    </div>
  );
}
