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
import { CheckIcon, XIcon } from "@/components/icons";

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

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      const item: ToastItem = {
        ...input,
        id,
        variant: input.variant ?? "default",
      };
      setItems((prev) => [...prev.slice(-2), item]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), 4500),
      );
    },
    [dismiss],
  );

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-20 z-[120] flex flex-col items-end gap-2 sm:inset-x-auto sm:bottom-5 sm:right-5"
        role="status"
        aria-live="polite"
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
          >
            <span
              className={cn(
                "mt-0.5 shrink-0",
                item.variant === "danger"
                  ? "text-danger"
                  : item.variant === "success"
                    ? "text-success"
                    : "text-muted",
              )}
            >
              {item.variant === "success" ? <CheckIcon size={15} /> : <XIcon size={15} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug text-fg">{item.title}</p>
              {item.description && (
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="-mr-1 -mt-1 rounded p-1 text-subtle transition-colors hover:text-fg"
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
