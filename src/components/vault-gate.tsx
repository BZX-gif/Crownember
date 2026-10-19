"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Field, Input, Notice, buttonClass } from "@/components/primitives";
import { KeyIcon, LockIcon, ShieldIcon } from "@/components/icons";

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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/chat/vault/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "The Vault stays sealed.");
        return;
      }
      if (needsSetup) setForged(true);
      setTimeout(() => window.location.reload(), needsSetup ? 1400 : 300);
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!username) {
    return (
      <div className="rounded-xl border border-line bg-panel p-7 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-line text-muted">
          <LockIcon size={20} />
        </span>
        <h1 className="display-title mt-5 text-2xl text-fg">The Vault</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
          A members-only room, sealed by a passcode the community holds. Sign in
          to knock.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/login" className={buttonClass("secondary", "md")}>
            Sign in
          </Link>
          <Link href="/register" className={buttonClass("primary", "md")}>
            Join VYRON
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-panel p-7">
      {forged ? (
        <div className="py-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-line text-fg">
            <KeyIcon size={20} />
          </span>
          <h1 className="display-title mt-5 text-2xl text-fg">Key forged</h1>
          <p className="mt-2 text-sm text-muted">Opening the Vault…</p>
        </div>
      ) : (
        <>
          <div className="text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-line text-muted">
              <LockIcon size={20} />
            </span>
            <p className="eyebrow mt-5">Members only</p>
            <h1 className="display-title mt-2 text-2xl text-fg">The Vault</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
              {needsSetup
                ? isFounder
                  ? "No passcode exists yet. As a founding member you can set the first one every future member will use."
                  : "No passcode exists yet. A founding member has to set the first one before anyone can enter."
                : "Enter the community passcode to step inside. Messages clear after 14 minutes and voice notes burn when you leave."}
            </p>
          </div>

          {(!needsSetup || isFounder) && (
            <form onSubmit={submit} className="mx-auto mt-6 w-full max-w-xs space-y-3">
              <Field
                label="Passcode"
                htmlFor="vault-passcode"
                hint={needsSetup ? "At least 6 characters." : undefined}
              >
                <Input
                  id="vault-passcode"
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value.slice(0, 64))}
                  placeholder={needsSetup ? "Set the first passcode" : "Passcode"}
                  autoComplete="off"
                  autoFocus
                />
              </Field>
              {error && <Notice variant="error">{error}</Notice>}
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={busy}
                disabled={passcode.length < 6}
                className="w-full"
              >
                {needsSetup ? "Forge key and enter" : "Unlock"}
              </Button>
            </form>
          )}

          <div className="mt-6 space-y-1.5 border-t border-line pt-4 text-center">
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-subtle">
              <ShieldIcon size={11} /> Attempts are rate-limited. The passcode is
              never stored in your browser.
            </p>
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-subtle">
              <KeyIcon size={11} /> Rotating the key signs every member out.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
