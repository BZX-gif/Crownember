"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { AlertIcon, CheckIcon, InfoIcon, XIcon } from "@/components/icons";

type Variant = "default" | "success" | "danger";

interface ToastInput {
  title: string;
  description?: string;
  variant?: Variant;
}

interface ToastItem extends ToastInput {
  id: number;
  variant: Variant;
}

interface ToastApi {
  toast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const lifetimes = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    lifetimes.current.delete(id);
  }, []);

  /** Keep a toast on screen while the pointer or keyboard focus is on it. */
  const hold = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const release = useCallback(
    (id: number) => {
      if (timers.current.has(id)) return;
      // Re-arm with the leftover time approximated by the original lifetime:
      // the toast has been held at least as long as it would have lasted.
      const lifetime = lifetimes.current.get(id) ?? 5000;
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), lifetime),
      );
    },
    [dismiss],
  );

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      const item: ToastItem = {
        ...input,
        id,
        variant: input.variant ?? "default",
      };
      setItems((prev) => [...prev.slice(-2), item]);
      // Errors stay long enough to be read on a phone; successes clear quickly.
      // Neither is dismissed if the user is hovering or focused inside it —
      // see the pause handlers on the toast itself.
      const lifetime = item.variant === "danger" ? 8000 : 5000;
      lifetimes.current.set(id, lifetime);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), lifetime),
      );
    },
    [dismiss],
  );

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[120] flex flex-col items-stretch gap-2 md:inset-x-auto md:bottom-5 md:right-5 md:items-end"
        aria-live="polite"
        aria-atomic="false"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "animate-fade-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border px-3.5 py-3 shadow-2xl shadow-black/40 backdrop-blur",
              item.variant === "danger"
                ? "border-danger/25 bg-[#170d0f]/95"
                : item.variant === "success"
                  ? "border-success/20 bg-[#0b1411]/95"
                  : "border-line-strong bg-[#111113]/95",
            )}
            onMouseEnter={() => hold(item.id)}
            onMouseLeave={() => release(item.id)}
            onFocus={() => hold(item.id)}
            onBlur={() => release(item.id)}
          >
            <span
              className={cn(
                "mt-0.5 shrink-0",
                item.variant === "danger"
                  ? "text-danger"
                  : item.variant === "success"
                    ? "text-success"
                    : "text-info",
              )}
            >
              {item.variant === "success" ? (
                <CheckIcon size={15} />
              ) : item.variant === "danger" ? (
                <AlertIcon size={15} />
              ) : (
                <InfoIcon size={15} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug text-fg">
                {item.title}
              </p>
              {item.description && (
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="-mr-1 -mt-1 rounded p-1.5 text-subtle transition-colors hover:text-fg"
              aria-label="Dismiss notification"
            >
              <XIcon size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { toast: () => undefined };
  }
  return ctx;
}
