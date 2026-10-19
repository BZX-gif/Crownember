"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/primitives";
import { AlertIcon } from "@/components/icons";

/**
 * Confirmation dialog for destructive or irreversible actions (leave, remove,
 * transfer, delete). Accessible by construction:
 *   - `role="dialog"` + `aria-modal` + an accessible name and description
 *   - focus moves in on open, Escape closes, focus returns to the trigger
 *   - the confirm button is not focused by default, so Enter cannot
 *     accidentally destroy something
 *   - `requirePhrase` makes the caller type a word before the action arms
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  requirePhrase,
  busy = false,
  danger = true,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** When set, the confirm button stays disabled until this exact text is typed. */
  requirePhrase?: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const phraseRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    // Let the panel paint before moving focus into it.
    const frame = requestAnimationFrame(() => {
      if (requirePhrase) phraseRef.current?.focus();
      else cancelRef.current?.focus();
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        if (!busy) onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, busy, onClose, requirePhrase]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        onClick={() => !busy && onClose()}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={description ? "confirm-dialog-description" : undefined}
        className="animate-fade-in relative w-full max-w-md rounded-xl border border-line-strong bg-elevated p-5 shadow-[0_30px_80px_rgba(0,0,0,0.7)]"
      >
        <div className="flex items-start gap-3">
          <span
            className={
              danger
                ? "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-danger/30 bg-danger/[0.07] text-danger"
                : "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-white/[0.04] text-muted"
            }
          >
            <AlertIcon size={15} />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-dialog-title" className="text-base font-semibold text-fg">
              {title}
            </h2>
            {description && (
              <p
                id="confirm-dialog-description"
                className="mt-1.5 text-sm leading-relaxed text-muted wrap-anywhere"
              >
                {description}
              </p>
            )}
          </div>
        </div>

        {requirePhrase && (
          <div className="mt-4">
            <label
              htmlFor="confirm-dialog-phrase"
              className="mb-1.5 block text-xs font-medium text-muted"
            >
              Type <span className="mono-meta text-fg">{requirePhrase}</span> to continue
            </label>
            <input
              ref={phraseRef}
              id="confirm-dialog-phrase"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="h-10 w-full rounded-lg border border-line bg-raised px-3 text-sm text-fg placeholder:text-subtle/70 focus:border-line-strong focus:outline-none"
              placeholder={requirePhrase}
              onChange={(event) => {
                const armed = event.target.value.trim() === requirePhrase;
                const confirm = panelRef.current?.querySelector<HTMLButtonElement>(
                  "[data-confirm-button]",
                );
                if (confirm) confirm.disabled = !armed || busy;
              }}
            />
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button ref={cancelRef} variant="secondary" size="md" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            data-confirm-button
            variant={danger ? "danger" : "primary"}
            size="md"
            loading={busy}
            disabled={busy || Boolean(requirePhrase)}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
