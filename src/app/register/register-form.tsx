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
            data.error ?? "The Founding Members just filled up. Join the waitlist!",
          );
          setTimeout(() => window.location.reload(), 2500);
          return;
        }
        setError(data.error ?? "Registration failed. Try again.");
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base sm:text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none";

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
        <label htmlFor="username" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-white/50">
          Username *
        </label>
        <input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
          placeholder="alex"
          maxLength={16}
          minLength={3}
          autoComplete="username"
          required
          className={inputCls}
        />
        <p className="mt-1 text-[11px] text-white/40">
          3-16 characters: letters, numbers, underscore.
        </p>
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-white/50">
          Password *
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          required
          className={inputCls}
        />
        <p className="mt-1 text-[11px] text-white/40">
          At least 8 characters. Make it something only you would pick.
        </p>
      </div>
      <div>
        <label htmlFor="uid" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-white/50">
          External ID <span className="text-white/30">(optional)</span>
        </label>
        <input
          id="uid"
          value={uid}
          onChange={(e) => setUid(e.target.value.replace(/\D/g, "").slice(0, 15))}
          placeholder="123456789"
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="bio" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-white/50">
          Bio <span className="text-white/30">(optional)</span>
        </label>
        <input
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, 200))}
          placeholder="Designer. Builder. Coffee enthusiast."
          className={inputCls}
        />
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-400"
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !username.trim() || !password}
        className="vyron-btn bg-white text-black w-full px-4 py-3.5 text-sm font-black transition hover:brightness-110 disabled:opacity-40"
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