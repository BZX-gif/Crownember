"use client";

import { useState } from "react";

export function WaitlistGate({
  taken,
  max,
  initialWaitlistCount,
}: {
  taken: number;
  max: number;
  initialWaitlistCount: number;
}) {
  const [nickname, setNickname] = useState("");
  const [note, setNote] = useState("");
  const [honey, setHoney] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState<number | null>(null);
  const [waitlistCount, setWaitlistCount] = useState(initialWaitlistCount);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: nickname.trim(),
          note: note.trim(),
          website: honey, // honeypot — real users never fill this
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not join the waitlist.");
        return;
      }
      setPosition(data.position);
      setWaitlistCount((c) => c + 1);
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl">
      <div className="text-center">
        <span className="inline-block animate-floaty text-5xl">🔒</span>
        <h1 className="mt-3 text-2xl font-black italic">
          <span className="text-fire">SOLD OUT.</span> All {max} Seats Claimed.
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-400">
          The Founding Squad is locked.{" "}
          <span className="font-bold text-orange-400">
            {waitlistCount} player{waitlistCount === 1 ? "" : "s"}
          </span>{" "}
          are already in line. If a seat ever opens up — or we raise the cap —
          the waitlist goes first.
        </p>
      </div>

      {/* Full seat meter */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
        <div className="flex items-center justify-between text-xs font-black">
          <span className="uppercase tracking-wider text-slate-400">
            Founding Squad
          </span>
          <span className="text-rose-400">
            {taken}/{max} · CLOSED
          </span>
        </div>
        <div className="mt-2 grid grid-cols-10 gap-1">
          {Array.from({ length: max }, (_, i) => (
            <span
              key={i}
              className="h-2.5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500"
            />
          ))}
        </div>
      </div>

      {position !== null ? (
        <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
          <p className="text-3xl">🎟️</p>
          <p className="mt-1 text-lg font-black text-emerald-400">
            You&apos;re in line!
          </p>
          <p className="mt-1 text-sm text-slate-300">
            Ticket <span className="font-black text-white">#{position}</span> —
            keep an eye on EMBERCROWN. Founders who go inactive lose their seat,
            and the waitlist gets the call.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          {/* Honeypot: invisible to humans, irresistible to bots */}
          <input
            type="text"
            value={honey}
            onChange={(e) => setHoney(e.target.value)}
            className="hidden"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />
          <div>
            <label
              htmlFor="wl-nickname"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400"
            >
              Your IGN / Nickname *
            </label>
            <input
              id="wl-nickname"
              value={nickname}
              onChange={(e) =>
                setNickname(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))
              }
              placeholder="ShadowSniper07"
              maxLength={20}
              className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-base sm:text-sm text-white placeholder:text-slate-600 focus:border-orange-500/60 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="wl-note"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400"
            >
              Why should we save you a seat?{" "}
              <span className="text-slate-600">(optional)</span>
            </label>
            <input
              id="wl-note"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 200))}
              placeholder="Diamond II rusher, I'll bring my whole squad"
              className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-base sm:text-sm text-white placeholder:text-slate-600 focus:border-orange-500/60 focus:outline-none"
            />
          </div>
          {error && (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-400">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || nickname.trim().length < 3}
            className="w-full rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3.5 text-sm font-black text-slate-950 shadow-lg shadow-orange-500/25 transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
          >
            {busy ? "Reserving…" : `Join the Waitlist (${waitlistCount} in line)`}
          </button>
        </form>
      )}
    </div>
  );
}
