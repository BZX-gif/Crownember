"use client";

import { useState } from "react";
import { Button, Field, Input, Notice } from "@/components/primitives";
import { CheckIcon, UsersIcon } from "@/components/icons";

export function WaitlistGate({
  taken,
  max,
}: {
  taken: number;
  max: number;
}) {
  const [nickname, setNickname] = useState("");
  const [note, setNote] = useState("");
  const [honey, setHoney] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState<number | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (nickname.trim().length < 3) {
      setError("Choose a username of at least 3 characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: nickname.trim(),
          note: note.trim(),
          website: honey,
        }),
      });
      const data = (await res.json()) as { position?: number; error?: string };
      if (!res.ok) {
        setError(data.error ?? "The waitlist could not be joined.");
        return;
      }
      setPosition(data.position ?? null);
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="waitlist" className="mt-6 rounded-xl border border-line bg-panel p-6 sm:p-7 lg:mt-0">
      <div>
        <p className="eyebrow">Waitlist</p>
        <h1 className="display-title mt-2 text-2xl text-fg">Founding seats are full</h1>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          All {max} founding seats are claimed. Add your username and we will
          open registration in order when a seat is released or the cap changes.
        </p>
      </div>

      <div className="mt-5 rounded-lg border border-line bg-ink/50 p-3.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted">Founding members</span>
          <span className="mono-meta">
            {taken}/{max} · closed
          </span>
        </div>
        <div className="mt-2 grid grid-cols-10 gap-1" aria-hidden="true">
          {Array.from({ length: max }, (_, index) => (
            <span key={index} className="h-1.5 rounded-full bg-fg/60" />
          ))}
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-subtle">
          <UsersIcon size={11} /> Everyone in line is a real person.
        </p>
      </div>

      {position !== null ? (
        <div className="mt-5 rounded-lg border border-line px-4 py-5 text-center">
          <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-line text-fg">
            <CheckIcon size={15} />
          </span>
          <p className="mt-3 text-sm font-medium text-fg">You are on the list</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Position <span className="text-fg">#{position}</span>. Sign-in
            details will be yours if a seat opens. Nothing else is promised.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-3.5" noValidate>
          <input
            type="text"
            value={honey}
            onChange={(e) => setHoney(e.target.value)}
            className="hidden"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />
          <Field label="Username" htmlFor="wl-nickname">
            <Input
              id="wl-nickname"
              value={nickname}
              onChange={(e) =>
                setNickname(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20))
              }
              placeholder="yourname"
              maxLength={20}
              autoComplete="username"
              required
            />
          </Field>
          <Field label="Note" htmlFor="wl-note" hint={`${note.length}/160 · optional`}>
            <Input
              id="wl-note"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 160))}
              placeholder="What would you like to write about?"
              maxLength={160}
            />
          </Field>
          {error && (
            <Notice variant="error">
              {error}
            </Notice>
          )}
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={busy}
            disabled={nickname.trim().length < 3}
            className="w-full"
          >
            {busy ? "Reserving…" : "Join the waitlist"}
          </Button>
        </form>
      )}
    </div>
  );
}
