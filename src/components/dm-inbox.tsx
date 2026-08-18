"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar, DevChip, FounderChip, RankBadge } from "@/components/ui";
import { cn, timeAgo, type PublicUser } from "@/lib/utils";

interface ThreadRow {
  other: PublicUser;
  lastContent: string;
  lastAt: string;
  lastFromMe: boolean;
}

export function DmInbox({
  friends,
  incoming,
  outgoing,
  threads,
}: {
  friends: PublicUser[];
  incoming: PublicUser[];
  outgoing: PublicUser[];
  threads: ThreadRow[];
}) {
  const [incomingList, setIncomingList] = useState(incoming);
  const [outgoingList, setOutgoingList] = useState(outgoing);
  const [friendList, setFriendList] = useState(friends);
  const [busyName, setBusyName] = useState("");

  async function respond(username: string, accept: boolean) {
    setBusyName(username);
    try {
      const res = await fetch(
        accept ? "/api/friends/accept" : "/api/friends/decline",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        },
      );
      const d = await res.json();
      if (res.ok) {
        const p = incomingList.find((u) => u.username === username);
        setIncomingList((l) => l.filter((u) => u.username !== username));
        if (accept && p) setFriendList((l) => [p, ...l]);
      } else if (d.error) {
        setIncomingList((l) => l.filter((u) => u.username !== username));
      }
    } finally {
      setBusyName("");
    }
  }

  async function cancel(username: string) {
    setBusyName(username);
    try {
      await fetch("/api/friends/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      setOutgoingList((l) => l.filter((u) => u.username !== username));
    } finally {
      setBusyName("");
    }
  }

  return (
    <div className="bg-grid nice-scroll h-full overflow-y-auto">
      <div className="relative mx-auto w-full max-w-2xl px-4 pb-10">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-56"
          style={{
            background:
              "radial-gradient(60% 100% at 50% 0%, rgba(255,106,0,0.12), transparent 70%)",
          }}
        />

        {/* header */}
        <div
          className="relative flex items-center justify-between py-3"
          style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
        >
          <div>
            <p className="font-hud text-[10px] font-bold uppercase tracking-[0.3em] text-orange-400">
              // private lines
            </p>
            <h1 className="display-glow mt-1 font-display text-3xl uppercase tracking-wide text-white">
              Messages
            </h1>
          </div>
          <Link
            href="/players"
            className="clip-btn bg-white/10 px-4 py-2 font-hud text-[10px] font-bold uppercase tracking-wider text-white transition hover:bg-white/20"
          >
            + find players
          </Link>
        </div>

        {/* friend requests */}
        {(incomingList.length > 0 || outgoingList.length > 0) && (
          <section className="relative mt-4">
            <h2 className="font-hud text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
              ⚡ friend requests
            </h2>
            <div className="mt-2 space-y-2">
              {incomingList.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3.5"
                >
                  <Link href={`/players/${encodeURIComponent(u.username)}`}>
                    <Avatar name={u.username} color={u.avatarColor} size={42} dev={u.dev} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      <span className="truncate font-bold text-white">
                        {u.username}
                      </span>
                      {u.dev && <DevChip size="xs" />}
                      {u.founder && <FounderChip size="xs" />}
                    </p>
                    <p className="font-hud text-[10px] uppercase tracking-wider text-amber-400/80">
                      wants to join your squad
                    </p>
                  </div>
                  <button
                    onClick={() => respond(u.username, true)}
                    disabled={busyName === u.username}
                    className="clip-btn bg-gradient-to-r from-emerald-500 to-teal-400 px-3.5 py-2 font-hud text-[10px] font-bold uppercase text-slate-950 transition hover:brightness-110 disabled:opacity-40"
                  >
                    accept
                  </button>
                  <button
                    onClick={() => respond(u.username, false)}
                    disabled={busyName === u.username}
                    className="border border-white/10 bg-white/5 px-3.5 py-2 font-hud text-[10px] font-bold uppercase text-slate-400 transition hover:text-slate-200 disabled:opacity-40"
                  >
                    pass
                  </button>
                </div>
              ))}
              {outgoingList.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-3.5"
                >
                  <Avatar name={u.username} color={u.avatarColor} size={42} dev={u.dev} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-white">{u.username}</p>
                    <p className="font-hud text-[10px] uppercase tracking-wider text-slate-500">
                      ⏳ request pending
                    </p>
                  </div>
                  <button
                    onClick={() => cancel(u.username)}
                    disabled={busyName === u.username}
                    className="border border-white/10 bg-white/5 px-3.5 py-2 font-hud text-[10px] font-bold uppercase text-slate-400 transition hover:text-slate-200 disabled:opacity-40"
                  >
                    cancel
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* conversations */}
        <section className="relative mt-6">
          <h2 className="font-hud text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
            ✉️ conversations{" "}
            <span className="text-slate-600">· burn after 3h</span>
          </h2>
          <div className="mt-2 space-y-2">
            {threads.length === 0 && (
              <p className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 text-center text-sm text-slate-500">
                No private lines yet. Open a player&apos;s profile and hit{" "}
                <span className="font-bold text-slate-300">✉️ message</span>.
              </p>
            )}
            {threads.map((t) => (
              <Link
                key={t.other.id}
                href={`/messages/${encodeURIComponent(t.other.username)}`}
                className="group flex items-center gap-3.5 rounded-2xl border border-white/10 bg-slate-900/70 p-4 transition duration-200 hover:translate-x-1 hover:border-orange-500/35 hover:bg-slate-900"
              >
                <Avatar
                  name={t.other.username}
                  color={t.other.avatarColor}
                  size={46}
                  dev={t.other.dev}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-display text-sm uppercase tracking-wide text-white group-hover:text-orange-400">
                      {t.other.username}
                    </span>
                    <RankBadge rank={t.other.rank} size="xs" />
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-slate-400">
                    {t.lastFromMe ? "you: " : ""}
                    {t.lastContent}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="font-hud text-[10px] text-slate-600">
                    {timeAgo(t.lastAt)}
                  </span>
                  <span className="text-lg text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-orange-400">
                    ›
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* squad */}
        {friendList.length > 0 && (
          <section className="relative mt-6">
            <h2 className="font-hud text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
              🤝 your squad · {friendList.length}
            </h2>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {friendList.map((u) => (
                <Link
                  key={u.id}
                  href={`/messages/${encodeURIComponent(u.username)}`}
                  className={cn(
                    "flex items-center gap-2.5 rounded-2xl border border-white/10 bg-slate-900/70 p-3 transition hover:border-emerald-500/40"
                  )}
                >
                  <Avatar name={u.username} color={u.avatarColor} size={34} dev={u.dev} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-white">
                      {u.username}
                    </span>
                    <span className="font-hud text-[9px] uppercase tracking-wider text-emerald-400/80">
                      squad
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
