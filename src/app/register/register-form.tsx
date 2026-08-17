"use client";

import { useState } from "react";

export function RegisterForm({
  seatNumber,
  maxSeats,
}: {
  seatNumber?: number;
  maxSeats?: number;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [uid, setUid] = useState("");
  const [bio, setBio] = useState("");
  const [honey, setHoney] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
          uid: uid.trim(),
          bio: bio.trim(),
          website: honey, // honeypot — real users never fill this
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          // Seats filled up while the form was open
          setError(
            data.error ?? "The Founding Squad just filled up. Join the waitlist!",
          );
          setTimeout(() => window.location.reload(), 2500);
          return;
        }
        setError(data.error ?? "Registration failed. Try again.");
        return;
      }
      window.location.href = "/chat";
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-base sm:text-sm text-white placeholder:text-slate-600 focus:border-orange-500/60 focus:outline-none";

  return (
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
        <label htmlFor="username" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
          Username / IGN *
        </label>
        <input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
          placeholder="BooyahKing"
          maxLength={16}
          className={inputCls}
        />
        <p className="mt-1 text-[11px] text-slate-500">
          3-16 characters: letters, numbers, underscore.
        </p>
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
          Password *
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="uid" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
          Free Fire UID <span className="text-slate-600">(optional)</span>
        </label>
        <input
          id="uid"
          value={uid}
          onChange={(e) => setUid(e.target.value.replace(/\D/g, "").slice(0, 15))}
          placeholder="224587013"
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="bio" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
          Bio <span className="text-slate-600">(optional)</span>
        </label>
        <input
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, 200))}
          placeholder="Rusher main. Clutch or die 🎯"
          className={inputCls}
        />
      </div>
      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-400">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !username.trim() || !password}
        className="w-full rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3.5 text-sm font-black text-slate-950 shadow-lg shadow-orange-500/25 transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
      >
        {busy
          ? "Creating…"
          : seatNumber
            ? `Claim Seat #${seatNumber} of ${maxSeats} — Free Forever`
            : "Create Account — Free Forever"}
      </button>
    </form>
  );
}
