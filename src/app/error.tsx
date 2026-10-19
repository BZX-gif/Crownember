"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("VYRON page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-5 py-16">
      <div className="w-full max-w-md rounded-xl border border-line bg-panel p-8">
        <p className="eyebrow">Error</p>
        <h1 className="display-title mt-2 text-2xl text-fg">
          This page could not load
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Something failed on the server. Nothing you wrote was lost — try the
          page again. If it keeps happening, come back in a minute.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-9 items-center rounded-lg bg-fg px-4 text-[13px] font-medium text-ink transition-colors hover:bg-white"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-lg border border-line px-4 text-[13px] text-fg transition-colors hover:border-line-strong"
          >
            Go home
          </Link>
        </div>
        {error.digest && (
          <p className="mono-meta mt-6">Reference {error.digest.slice(0, 12)}</p>
        )}
      </div>
    </div>
  );
}
