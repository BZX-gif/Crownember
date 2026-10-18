"use client";

import { useState } from "react";

const INPUT_CLS =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[15px] text-white placeholder:text-zinc-600 transition focus:border-white/40 focus:outline-none";

export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed. Try again.");
        return;
      }
      window.location.href = "/forum";
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-7 space-y-4">
      <div>
        <label
          htmlFor="username"
          className="mb-1.5 block font-hud text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500"
        >
          Username
        </label>
        <input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="yourname"
          autoComplete="username"
          className={INPUT_CLS}
        />
      </div>
      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block font-hud text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500"
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          className={INPUT_CLS}
        />
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-400/25 bg-rose-500/[0.07] px-4 py-2.5 text-sm text-rose-200"
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !username.trim() || !password}
        className="w-full rounded-full bg-zinc-100 px-4 py-3 text-sm font-semibold text-black transition hover:bg-white active:scale-[0.99] disabled:opacity-30"
      >
        {busy ? "Opening…" : "Log in"}
      </button>
    </form>
  );
}
