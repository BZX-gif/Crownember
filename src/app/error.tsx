"use client";

import Link from "next/link";
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
    console.error("VYRON page error:", error);
  }, [error]);

  return (
    <div className="bg-grid-subtle flex min-h-[100dvh] items-center justify-center p-4">
      <div className="vyron-corners card-base w-full max-w-md p-8 text-center">
        <span className="inline-block text-5xl">🛡️</span>
        <h1 className="mt-4 font-display text-3xl uppercase tracking-wide text-white">
          The platform is <span className="text-vyron">reconnecting</span>
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-white/50">
          Something broke the link. If you are a user —
          try again in a minute. If you are the{" "}
          <span className="font-bold text-white">owner</span>: open{" "}
          <span className="font-hud text-xs text-white/60">/api/health</span>{" "}
          on your site — it will tell you exactly what&apos;s wrong.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={reset}
            className="vyron-btn bg-white text-black px-6 py-3 font-display text-xs uppercase tracking-widest transition hover:-translate-y-0.5 hover:brightness-110"
          >
            ↻ Try again
          </button>
          <Link
            href="/"
            className="vyron-btn border border-white/10 bg-white/5 px-6 py-3 font-display text-xs uppercase tracking-widest text-white transition hover:bg-white/10 hover:border-white/20"
          >
            Go home
          </Link>
        </div>
        <p className="mt-5 font-hud text-[10px] uppercase tracking-wider text-white/30">
          ref: {error.digest?.slice(0, 12) ?? "n/a"}
        </p>
      </div>
    </div>
  );
}
