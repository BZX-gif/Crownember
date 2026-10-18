"use client";

import { useState } from "react";

const INPUT_CLS =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[15px] text-white placeholder:text-zinc-600 transition focus:border-white/40 focus:outline-none";

export function RegisterForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
          bio: bio.trim(),
          website: honey, // honeypot — real users never fill this
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          // A cap filled up while the form was open
          setError(
            data.error ?? "Registration just filled up. Join the waitlist!",
          );
          setTimeout(() => window.location.reload(), 2500);
          return;
        }
        setError(data.error ?? "Registration failed. Try again.");
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
          htmlFor="username"
          className="mb-1.5 block font-hud text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500"
        >
          Username
        </label>
        <input
          id="username"
          value={username}
          onChange={(e) =>
            setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))
          }
          placeholder="yourname"
          maxLength={16}
          minLength={3}
          autoComplete="username"
          required
          className={INPUT_CLS}
        />
        <p className="mt-1.5 text-xs text-zinc-600">
          3–16 characters: letters, numbers, underscore. This is your
          permanent address.
        </p>
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
          placeholder="At least 8 characters"
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          required
          className={INPUT_CLS}
        />
        <p className="mt-1.5 text-xs text-zinc-600">
          Stored only as a salted hash. Make it something only you would pick.
        </p>
      </div>
      <div>
        <label
          htmlFor="bio"
          className="mb-1.5 block font-hud text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500"
        >
          Bio <span className="text-zinc-700">(optional)</span>
        </label>
        <input
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, 200))}
          placeholder="One line about you."
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
        disabled={busy || !username.trim() || password.length < 8}
        className="w-full rounded-full bg-zinc-100 px-4 py-3 text-sm font-semibold text-black transition hover:bg-white active:scale-[0.99] disabled:opacity-30"
      >
        {busy ? "Creating…" : "Create account — free forever"}
      </button>
    </form>
  );
}
