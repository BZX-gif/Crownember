"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, DevChip, FounderChip, RankBadge } from "@/components/ui";
import { Button, Notice, buttonClass } from "@/components/primitives";
import {
  ArrowLeftIcon,
  CheckIcon,
  LockIcon,
  PencilIcon,
  ReplyIcon,
  SendIcon,
} from "@/components/icons";
import { ExpiryCountdown } from "@/components/expiry-countdown";
import { cn, type PublicUser } from "@/lib/utils";

export interface DmMessage {
  id: number;
  content: string;
  createdAt: string;
  mine: boolean;
  editable?: boolean;
}

const MAX_LEN = 400;
const EDIT_WINDOW_MS = 3 * 60 * 1000;

/** Read the edit window outside render so the component stays pure. */
function canStillEdit(message: DmMessage) {
  return (
    message.mine &&
    Date.now() - new Date(message.createdAt).getTime() < EDIT_WINDOW_MS
  );
}

export function DmThread({
  me,
  other,
  sealed,
  initialMessages,
}: {
  me: PublicUser;
  other: PublicUser;
  sealed: boolean;
  initialMessages: DmMessage[];
}) {
  const [messages, setMessages] = useState<DmMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connLost, setConnLost] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<DmMessage | null>(null);
  const [actionsFor, setActionsFor] = useState<number | null>(null);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastIdRef = useRef(initialMessages.at(-1)?.id ?? 0);
  const stickRef = useRef(true);
  const lastFetch = useRef(0);

  const poll = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const res = await fetch(
        `/api/dm/messages?with=${encodeURIComponent(other.username)}&after=${lastIdRef.current}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        setConnLost(true);
        return;
      }
      const data = (await res.json()) as { sealed?: boolean; messages?: DmMessage[] };
      setConnLost(false);
      lastFetch.current = Date.now();
      if (data.sealed) return;
      const incoming = data.messages ?? [];
      if (incoming.length > 0) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...incoming.filter((m) => !seen.has(m.id))].slice(-200);
        });
        lastIdRef.current = Math.max(
          lastIdRef.current,
          ...incoming.map((m) => m.id),
        );
      }
    } catch {
      setConnLost(true);
    }
  }, [other.username]);

  useEffect(() => {
    if (sealed) return;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    async function tick() {
      await poll();
      if (!cancelled) timer = setTimeout(tick, 6_000);
    }
    timer = setTimeout(tick, 6_000);
    function onVisible() {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastFetch.current > 5_000
      ) {
        void poll();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll, sealed]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  function startReply(message: DmMessage) {
    setActionsFor(null);
    setEditingId(null);
    setReplyingTo(message);
    inputRef.current?.focus();
  }

  function startEdit(message: DmMessage) {
    if (!message.mine) return;
    if (Date.now() - new Date(message.createdAt).getTime() >= EDIT_WINDOW_MS) return;
    setActionsFor(null);
    setReplyingTo(null);
    setEditingId(message.id);
    setInput(message.content.slice(0, MAX_LEN));
    inputRef.current?.focus();
  }

  function cancelAction() {
    setEditingId(null);
    setReplyingTo(null);
    setInput("");
    inputRef.current?.focus();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || busy) return;
    setBusy(true);
    setError("");
    try {
      if (editingId !== null) {
        const res = await fetch("/api/dm/messages", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, content }),
        });
        const data = (await res.json()) as { message?: DmMessage; error?: string };
        if (!res.ok || !data.message) {
          setError(data.error ?? "The edit could not be saved.");
          return;
        }
        setMessages((prev) =>
          prev.map((message) => (message.id === editingId ? data.message! : message)),
        );
        setEditingId(null);
        setInput("");
        return;
      }

      const prefix = replyingTo
        ? `↪ ${replyingTo.mine ? "You" : other.username}: "${replyingTo.content.slice(0, 100)}"\n`
        : "";
      const res = await fetch("/api/dm/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: other.username,
          content: `${prefix}${content}`.slice(0, MAX_LEN),
        }),
      });
      const data = (await res.json()) as { message?: DmMessage; error?: string };
      if (!res.ok || !data.message) {
        setError(data.error ?? "The message could not be sent.");
        return;
      }
      setReplyingTo(null);
      setInput("");
      stickRef.current = true;
      setMessages((prev) =>
        [...prev.filter((m) => m.id !== data.message!.id), data.message!].slice(-200),
      );
      lastIdRef.current = Math.max(lastIdRef.current, data.message.id);
    } catch {
      setError("Network error — the message was not sent.");
    } finally {
      setBusy(false);
    }
  }

  if (sealed) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-ink">
        <ThreadHeader other={other} />
        <div className="flex flex-1 items-center justify-center px-4 py-12">
          <div className="w-full max-w-md rounded-xl border border-line bg-panel p-7 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-line text-muted">
              <LockIcon size={18} />
            </span>
            <h1 className="display-title mt-5 text-2xl text-fg">Conversation sealed</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              A block sits between you. No messages can cross it in either
              direction. Lift the block from a profile to open the channel again.
            </p>
            <Link
              href={`/players/${encodeURIComponent(other.username)}`}
              className={buttonClass("secondary", "sm", "mt-6")}
            >
              View profile
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-ink">
      <ThreadHeader other={other} />

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="nice-scroll flex-1 overflow-y-auto"
        aria-live="polite"
      >
        <div className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-4">
          {messages.length === 0 ? (
            <div className="flex min-h-[45vh] flex-col items-center justify-center text-center">
              <Avatar name={other.username} size={48} dev={other.dev} />
              <p className="mt-4 text-sm font-medium text-fg">{other.username}</p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">
                This is the beginning of a private conversation. Messages clear
                three hours after they are sent.
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {messages.map((message) => {
                const canEdit = canStillEdit(message);
                const actionsOpen = actionsFor === message.id;

                return (
                  <li
                    key={message.id}
                    className={cn("group flex", message.mine ? "justify-end" : "justify-start")}
                  >
                    <div className="relative max-w-[86%] sm:max-w-[70%]">
                      <div
                        className={cn(
                          "flex items-end gap-1",
                          message.mine ? "flex-row-reverse" : "flex-row",
                        )}
                      >
                        <div
                          className={cn(
                            "rounded-xl border px-3.5 py-2.5",
                            message.mine
                              ? "border-line-strong bg-white/[0.07] text-fg"
                              : "border-line bg-panel text-[#e4e4e7]",
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
                            {message.content}
                          </p>
                          <div className="mt-1 flex items-center justify-end gap-2">
                            <ExpiryCountdown createdAt={message.createdAt} vault={false} />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setActionsFor((current) =>
                              current === message.id ? null : message.id,
                            )
                          }
                          aria-label="Message actions"
                          aria-expanded={actionsOpen}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-subtle opacity-0 transition-opacity hover:bg-white/[0.06] hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <ReplyIcon size={13} />
                        </button>
                      </div>

                      {actionsOpen && (
                        <div
                          className={cn(
                            "absolute bottom-full z-20 mb-1.5 flex items-center gap-0.5 rounded-lg border border-line-strong bg-elevated p-1 shadow-lg",
                            message.mine ? "right-0" : "left-0",
                          )}
                          role="menu"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => startReply(message)}
                            className="flex items-center gap-1.5 rounded px-2 py-1.5 text-[11px] text-fg transition-colors hover:bg-white/[0.07]"
                          >
                            <ReplyIcon size={12} /> Reply
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => startEdit(message)}
                              className="flex items-center gap-1.5 rounded px-2 py-1.5 text-[11px] text-fg transition-colors hover:bg-white/[0.07]"
                            >
                              <PencilIcon size={12} /> Edit
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div
        className="shrink-0 border-t border-line bg-ink"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto w-full max-w-3xl px-3 py-2.5 sm:px-4">
          {connLost && (
            <p className="mb-2 text-[10px] text-subtle">
              Connection interrupted — retrying automatically.
            </p>
          )}
          {error && (
            <Notice variant="error" className="mb-2">
              {error}
            </Notice>
          )}
          {(editingId !== null || replyingTo) && (
            <div className="mb-2 flex items-center gap-2 rounded-md border border-line bg-panel px-2.5 py-1.5">
              <span className="flex-1 truncate text-[10px] text-muted">
                {editingId !== null
                  ? "Editing your message"
                  : `Replying to ${replyingTo?.mine ? "yourself" : other.username}`}
              </span>
              <button
                type="button"
                onClick={cancelAction}
                className="text-[10px] text-subtle transition-colors hover:text-fg"
              >
                Cancel
              </button>
            </div>
          )}

          <form onSubmit={submit}>
            <div className="flex items-end gap-2">
              <label htmlFor="dm-message" className="sr-only">
                Message {other.username}
              </label>
              <input
                id="dm-message"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, MAX_LEN))}
                placeholder={
                  editingId !== null ? "Edit your message" : `Message ${other.username}`
                }
                autoComplete="off"
                maxLength={MAX_LEN}
                className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 text-[13px] text-fg placeholder:text-subtle focus:border-line-strong focus:outline-none"
              />
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={!input.trim()}
                loading={busy}
                aria-label={editingId !== null ? "Save edit" : "Send message"}
                className="h-10 w-10 px-0"
              >
                {editingId !== null ? <CheckIcon size={16} /> : <SendIcon size={16} />}
              </Button>
            </div>
            <p className="mt-1.5 hidden text-[10px] text-subtle sm:block">
              Private between you and {other.username}. Clears three hours after
              sending.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

function ThreadHeader({ other }: { other: PublicUser }) {
  return (
    <header
      className="shrink-0 border-b border-line"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-3 py-2.5 sm:px-4">
        <Link
          href="/messages"
          aria-label="Back to messages"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.05] hover:text-fg"
        >
          <ArrowLeftIcon size={17} />
        </Link>
        <Link
          href={`/players/${encodeURIComponent(other.username)}`}
          className="flex min-w-0 flex-1 items-center gap-2.5"
        >
          <Avatar name={other.username} size={32} dev={other.dev} />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-fg">
              {other.username}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5">
              <RankBadge rank={other.rank} size="xs" />
              {other.founder && <FounderChip size="xs" />}
              {other.dev && <DevChip size="xs" />}
            </span>
          </span>
        </Link>
      </div>
    </header>
  );
}
