"use client";

import { useState } from "react";

export function VaultGate({
  needsSetup,
  isFounder,
  username,
}: {
  needsSetup: boolean;
  isFounder: boolean;
  username: string | null;
}) {
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [forged, setForged] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/chat/vault/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "The Vault stays sealed.");
        return;
      }
      if (needsSetup) setForged(true);
      setTimeout(() => window.location.reload(), needsSetup ? 1600 : 350);
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!username) {
    return (
      <section className="flex min-h-[420px] flex-col items-center justify-center bg-zinc-900/70 p-10 text-center">
        <span className="text-6xl">🔐</span>
        <h1 className="mt-4 font-display text-3xl uppercase tracking-wide text-white">
          The <span className="text-zinc-100 font-bold">Vault</span>
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-zinc-400">
          The inner circle is sealed by a passcode known only to its members.
          Log in to knock on the door.
        </p>
        <div className="mt-6 flex gap-3">
          <a
            href="/login"
            className="bg-white/10 px-6 py-3 font-display text-xs uppercase tracking-widest text-white transition hover:bg-white/20"
          >
            Log in
          </a>
          <a
            href="/register"
            className="bg-zinc-100 px-6 py-3 font-display text-xs uppercase tracking-widest text-zinc-950 transition hover:brightness-110"
          >
            Join VYRON
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="relative flex min-h-[480px] flex-col items-center justify-center overflow-hidden bg-zinc-900/80 p-8 text-center">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

      {forged ? (
        <div>
          <span className="inline-block animate-floaty text-6xl">🗝️</span>
          <h1 className="mt-4 font-display text-2xl uppercase tracking-wide text-zinc-300">
            Key forged. Vault open.
          </h1>
          <p className="mt-2 font-hud text-xs text-zinc-400">
            entering the inner circle…
          </p>
        </div>
      ) : (
        <>
          <span className="inline-block text-6xl">🔐</span>
          <p className="mt-4 font-hud text-[11px] font-bold uppercase tracking-[0.3em] text-zinc-300">
            {"// restricted area"}
          </p>
          <h1 className="mt-2 font-display text-3xl uppercase tracking-wide text-white sm:text-4xl">
            The <span className="text-zinc-100 font-bold">Vault</span>
          </h1>

          {needsSetup ? (
            <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
              The Vault has <span className="font-bold text-zinc-300">no key yet</span>.
              {isFounder
                ? " As a founding member, the honor is yours: forge the passcode every future member will need."
                : ` Only a founding member can forge the first key. ${username}, you're not a founder — ask one to open the way.`}
            </p>
          ) : (
            <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
              Members-only inner circle. Voice notes burn the instant anyone
              leaves. Enter the passcode to step inside.
            </p>
          )}

          {(!needsSetup || isFounder) && (
            <form onSubmit={submit} className="mt-6 w-full max-w-xs">
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value.slice(0, 64))}
                placeholder={needsSetup ? "Forge the key (min 6 chars)…" : "Passcode…"}
                autoComplete="off"
                className="w-full border border-white/20 bg-zinc-950/80 px-4 py-3.5 text-center font-hud text-base tracking-[0.3em] text-zinc-300 placeholder:tracking-normal placeholder:text-zinc-600 focus:border-white/20 focus:outline-none sm:text-sm"
              />
              {error && (
                <p className="mt-3 border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-400">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={busy || passcode.length < 6}
                className="mt-4 w-full bg-zinc-100 px-6 py-3.5 font-display text-xs uppercase tracking-widest text-zinc-950 transition hover:-translate-y-0.5 hover:brightness-110 disabled:opacity-40"
              >
                {busy
                  ? "…"
                  : needsSetup
                    ? "🗝️ Forge the key"
                    : "Unlock the Vault"}
              </button>
            </form>
          )}

          <div className="mt-6 space-y-1 font-hud text-[10px] uppercase tracking-wider text-zinc-600">
            <p>🚨 attempts are strictly rate-limited</p>
            <p>🔒 passcode never touches your browser</p>
            <p>🎙️ voice self-destructs on exit</p>
          </div>
        </>
      )}
    </section>
  );
}
