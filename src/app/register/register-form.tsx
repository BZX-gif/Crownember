"use client";

import { useState } from "react";
import { Button, Field, Input, Notice, Textarea } from "@/components/primitives";
import { USERNAME_RE } from "@/lib/lookup";

const MIN_PASSWORD = 8;

export function RegisterForm({
  seatNumber,
  maxSeats,
}: {
  seatNumber?: number;
  maxSeats?: number;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [bio, setBio] = useState("");
  const [honey, setHoney] = useState("");
  const [error, setError] = useState("");
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState(false);

  const usernameValid = USERNAME_RE.test(username);
  const passwordValid = password.length >= MIN_PASSWORD;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setFull(false);

    if (!usernameValid) {
      setError("Usernames are 3-16 characters: letters, numbers and underscore only.");
      return;
    }
    if (!passwordValid) {
      setError(`Passwords need at least ${MIN_PASSWORD} characters.`);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
          bio: bio.trim(),
          website: honey,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        if (res.status === 403) setFull(true);
        setError(data.error ?? "Your account could not be created.");
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Network error — your account was not created. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
      <input
        type="text"
        value={honey}
        onChange={(e) => setHoney(e.target.value)}
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />

      <Field
        label="Username"
        htmlFor="register-username"
        hint="3-16 characters: letters, numbers, underscore."
      >
        <Input
          id="register-username"
          value={username}
          onChange={(e) =>
            setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 16))
          }
          placeholder="yourname"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={16}
          required
          autoFocus
          aria-invalid={username.length > 0 && !usernameValid}
        />
      </Field>

      <Field
        label="Password"
        htmlFor="register-password"
        hint="At least 8 characters. Length beats complexity."
      >
        <Input
          id="register-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Choose a password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          maxLength={128}
          required
          aria-invalid={password.length > 0 && !passwordValid}
        />
      </Field>

      <Field
        label="Bio"
        htmlFor="register-bio"
        hint={`${bio.length}/160 · optional`}
      >
        <Textarea
          id="register-bio"
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, 160))}
          placeholder="One line about what you write or care about."
          rows={2}
          maxLength={160}
          className="min-h-[60px]"
        />
      </Field>

      {error && (
        <Notice variant="error">
          {error}
          {full && (
            <>
              {" "}
              <a href="#waitlist" className="underline underline-offset-2">
                Join the waitlist
              </a>
              .
            </>
          )}
        </Notice>
      )}

      <Button
        type="submit"
        variant="primary"
        size="md"
        loading={busy}
        disabled={!usernameValid || !passwordValid}
        className="w-full"
      >
        {busy ? "Creating account…" : "Create account"}
      </Button>

      {seatNumber && maxSeats && (
        <p className="text-center text-[10px] text-subtle">
          Claiming founding seat {seatNumber} of {maxSeats}.
        </p>
      )}
    </form>
  );
}
