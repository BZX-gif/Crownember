"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useToast } from "@/components/toast";

/**
 * One mutation helper for every group control.
 *
 * It exists so no client component hand-rolls its own fetch: the same loading
 * state, the same error surface, the same `router.refresh()` after a write that
 * changed server-rendered truth (roles, counts, invitations).
 */
export function useGroupAction() {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(
    async <T,>(
      key: string,
      path: string,
      init?: RequestInit,
      options?: {
        title?: string;
        description?: string;
        /** Skip the refresh when the caller updates its own local state instead. */
        refresh?: boolean;
        silent?: boolean;
      },
    ): Promise<T | null> => {
      if (busy) return null;
      setBusy(key);
      setError(null);
      try {
        const res = await fetch(path, init);
        const data = (await res.json().catch(() => null)) as
          | (T & { error?: string })
          | null;
        if (!res.ok) {
          const message =
            data?.error ??
            (res.status === 404
              ? "Group not found."
              : res.status === 429
                ? "Slow down — try again in a moment."
                : `Request failed (${res.status}).`);
          setError(message);
          if (!options?.silent) {
            toast({ title: options?.title ?? "That did not work", description: message, variant: "danger" });
          }
          return null;
        }
        if (options?.title) {
          toast({ title: options.title, description: options.description, variant: "success" });
        }
        if (options?.refresh !== false) router.refresh();
        return data;
      } catch {
        const message = "Network error — nothing was changed.";
        setError(message);
        if (!options?.silent) {
          toast({ title: "Network error", description: message, variant: "danger" });
        }
        return null;
      } finally {
        setBusy(null);
      }
    },
    [busy, router, toast],
  );

  return { busy, error, call, clearError: () => setError(null) };
}

/** JSON POST/PATCH/DELETE bodies, the shape every group endpoint expects. */
export function jsonInit(method: "POST" | "PATCH" | "DELETE", body?: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}
