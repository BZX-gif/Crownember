"use client";

import { useState } from "react";
import { Button, Field, Input, Notice } from "@/components/primitives";

export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Sign in failed. Check your details and try again.");
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
      <Field label="Username" htmlFor="login-username">
        <Input
          id="login-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Your username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={16}
          required
          autoFocus
        />
      </Field>

      <Field label="Password" htmlFor="login-password">
        <Input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password"
          autoComplete="current-password"
          maxLength={128}
          required
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
        disabled={!username.trim() || !password}
        className="w-full"
      >
        {busy ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-center text-[10px] leading-relaxed text-subtle">
        Sign-in attempts are rate-limited to protect accounts.
      </p>
    </form>
  );
}
