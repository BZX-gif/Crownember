"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { SendIcon } from "@/components/icons";
import { Button, Notice, Textarea } from "@/components/primitives";
import type { PublicUser, ReplyDTO } from "@/lib/utils";

const MAX_LEN = 2000;

export function ReplyComposer({
  topicId,
  user,
  onPosted,
  compact = false,
  autoFocus = false,
  id,
  className,
  notifyOnSuccess = false,
}: {
  topicId: number;
  user: PublicUser | null;
  onPosted?: (reply: ReplyDTO) => void;
  compact?: boolean;
  autoFocus?: boolean;
  id?: string;
  className?: string;
  notifyOnSuccess?: boolean;
}) {
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const lastSent = useRef<{ text: string; at: number } | null>(null);

  if (!user) {
    return (
      <div
        id={id}
        className={
          className ??
          "rounded-xl border border-line bg-panel px-5 py-5 text-center text-sm text-muted"
        }
      >
        <Link href="/login" className="font-medium text-fg hover:underline">
          Sign in
        </Link>{" "}
        or{" "}
        <Link href="/register" className="font-medium text-fg hover:underline">
          join VYRON
        </Link>{" "}
        to reply.
      </div>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = content.trim();
    if (!text || busy) return;
    if (text.length > MAX_LEN) {
      setError(`Replies are limited to ${MAX_LEN} characters.`);
      return;
    }
    const previous = lastSent.current;
    if (previous && previous.text === text && Date.now() - previous.at < 8000) {
      setStatus("That reply was already posted.");
      return;
    }

    setBusy(true);
    setError("");
    setStatus("");
    try {
      const res = await fetch(`/api/forum/topics/${topicId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const data = (await res.json()) as { reply?: ReplyDTO; error?: string; code?: string };
      if (!res.ok || !data.reply) {
        setError(data.error ?? "Your reply could not be posted. Try again.");
        return;
      }
      setContent("");
      setStatus("Reply posted.");
      lastSent.current = { text, at: Date.now() };
      onPosted?.(data.reply);
      if (notifyOnSuccess) {
        toast({ title: "Reply posted", variant: "success" });
      }
    } catch {
      setError("Network error — your reply was not posted. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id={id} onSubmit={submit} className={className}>
      <Textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value.slice(0, MAX_LEN));
          if (error) setError("");
          if (status) setStatus("");
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void submit(e);
          }
        }}
        rows={compact ? 3 : 4}
        maxLength={MAX_LEN}
        placeholder={
          compact ? "Write a reply…" : "Add something useful to the conversation…"
        }
        aria-label="Write a reply"
        autoFocus={autoFocus}
        className={compact ? "min-h-20" : "min-h-32"}
      />
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
        <p className="mono-meta">
          {content.length}/{MAX_LEN}
          <span className="ml-2 hidden sm:inline">⌘↵ to post</span>
        </p>
        <div className="flex items-center gap-2">
          {status && (
            <span role="status" className="text-xs text-success">
              {status}
            </span>
          )}
          <Button
            type="submit"
            variant="primary"
            size={compact ? "sm" : "md"}
            loading={busy}
            disabled={!content.trim()}
          >
            <SendIcon size={14} />
            {busy ? "Posting…" : compact ? "Reply" : "Post reply"}
          </Button>
        </div>
      </div>
      {error && (
        <Notice className="mt-2.5" variant="error">
          {error}
        </Notice>
      )}
    </form>
  );
}
