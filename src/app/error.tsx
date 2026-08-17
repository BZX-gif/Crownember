"use client";

import { useEffect } from "react";

/**
 * Branded safety net — when any page crashes (e.g. the database password
 * was rotated and Vercel still holds the old one), players see this
 * instead of a scary generic error. It tells the owner exactly what to do.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // surface the real cause in the browser console for debugging
    console.error("EMBERCROWN page error:", error);
  }, [error]);

  return (
    <div className="bg-grid flex min-h-[100dvh] items-center justify-center p-4">
      <div className="hud-corners clip-card w-full max-w-md bg-slate-900/90 p-8 text-center">
        <span className="inline-block text-5xl">🛡️</span>
        <h1 className="mt-4 font-display text-3xl uppercase tracking-wide text-white">
          The arena is <span className="text-fire">reconnecting</span>
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Something broke the link to the vault below. If you are a player —
          try again in a minute. If you are the{" "}
          <span className="font-bold text-amber-300">owner</span>: open{" "}
          <span className="font-hud text-xs text-emerald-400">/api/health</span>{" "}
          on your site — it will tell you exactly which wire is loose.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={reset}
            className="clip-btn bg-gradient-to-r from-orange-500 to-amber-400 px-6 py-3 font-display text-xs uppercase tracking-widest text-slate-950 transition hover:-translate-y-0.5 hover:brightness-110"
          >
            ↻ Try again
          </button>
          <a
            href="/"
            className="clip-btn border-0 bg-white/10 px-6 py-3 font-display text-xs uppercase tracking-widest text-white transition hover:bg-white/20"
          >
            Go home
          </a>
        </div>
        <p className="mt-5 font-hud text-[10px] uppercase tracking-wider text-slate-600">
          ref: {error.digest?.slice(0, 12) ?? "n/a"}
        </p>
      </div>
    </div>
  );
}
