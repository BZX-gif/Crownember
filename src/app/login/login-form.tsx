"use client";

import { useState } from "react";

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
      <div>
        <label htmlFor="username" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-white/50">
          Username
        </label>
        <input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="alex"
          autoComplete="username"
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-white/50">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
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
        {busy ? "Signing in…" : "Log In"}
      </button>
    </form>
  );
}