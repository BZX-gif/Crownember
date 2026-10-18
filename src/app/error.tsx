"use client";

import Link from "next/link";
import { useEffect } from "react";
import { VyMark } from "@/components/icons";

/**
 * Branded safety net — when any page crashes (e.g. the database password
 * was rotated and Vercel still holds the old one), members see this
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
    <div className="bg-grid flex min-h-[100dvh] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0a0a0a] p-8 text-center">
        <VyMark className="mx-auto h-11 w-11 opacity-80" />
        <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-white">
          The line dropped.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-500">
          Something interrupted the connection below. If you are a member —
          try again in a minute. If you are the{" "}
          <span className="font-semibold text-zinc-300">owner</span>: open{" "}
          <span className="font-hud text-xs text-emerald-400/90">
            /api/health
          </span>{" "}
          on your site — it will tell you exactly which wire is loose.
        </p>
        <div className="mt-7 flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-full bg-zinc-100 px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-white"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-full border border-white/15 px-6 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/5"
          >
            Go home
          </Link>
        </div>
        <p className="mt-6 font-hud text-[10px] uppercase tracking-widest text-zinc-700">
          ref: {error.digest?.slice(0, 12) ?? "n/a"}
        </p>
      </div>
    </div>
  );
}
