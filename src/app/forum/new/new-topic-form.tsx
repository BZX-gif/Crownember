"use client";

import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { CATEGORIES, cn, type PublicUser } from "@/lib/utils";

const MAX_TITLE = 120;
const MAX_CONTENT = 4000;

/**
 * The post composer.
 *  - "compact" renders the inline feed variant: one calm box at the top of
 *    the feed (title optional until you expand; body-first flow)
 *  - full renders the standalone /forum/new page
 * Same API, same validation — the server decides what is acceptable.
 */
export function NewTopicForm({
  user,
  compact = false,
}: {
  user?: PublicUser | null;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(!compact);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<string>("general");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/forum/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          category,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create post.");
        setBusy(false);
        return;
      }
      window.location.href = `/forum/${data.topic.id}`;
    } catch {
      setError("Network error — your draft is safe, try again.");
      setBusy(false);
    }
  }

  if (compact && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3.5 text-left transition hover:border-white/25"
        aria-label="Start a new post"
      >
        {user && (
          <Avatar name={user.username} color={user.avatarColor} size={32} dev={user.dev} />
        )}
        <span className="text-[15px] text-zinc-500">
          Share something with everyone…
        </span>
        <span className="ml-auto rounded-full bg-zinc-100 px-3.5 py-1.5 text-xs font-semibold text-black">
          Post
        </span>
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className={cn(
        compact &&
          "animate-fade-in rounded-2xl border border-white/12 bg-white/[0.02] p-4 sm:p-5",
      )}
    >
      <div className={cn(compact && "flex gap-3")}>
        {compact && user && (
          <Avatar
            name={user.username}
            color={user.avatarColor}
            size={36}
            dev={user.dev}
            className="mt-1 hidden sm:block"
          />
        )}
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <label htmlFor={compact ? "nt-title-inline" : "title"} className="sr-only">
              Title
            </label>
            <input
              id={compact ? "nt-title-inline" : "title"}
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
              placeholder="Give it a title"
              maxLength={MAX_TITLE}
              autoFocus={compact}
              className="w-full border-b border-white/10 bg-transparent pb-2 text-lg font-semibold text-white placeholder:text-zinc-600 focus:border-white/40 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor={compact ? "nt-body-inline" : "content"} className="sr-only">
              Body
            </label>
            <textarea
              id={compact ? "nt-body-inline" : "content"}
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, MAX_CONTENT))}
              rows={compact ? 4 : 9}
              placeholder="Say it fully — the details are the good part."
              className="nice-scroll w-full resize-y bg-transparent text-[15px] leading-relaxed text-white placeholder:text-zinc-600 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className={cn("mt-4", compact && "sm:pl-12")}>
        <div
          role="radiogroup"
          aria-label="Category"
          className="flex flex-wrap gap-1.5"
        >
          {CATEGORIES.map((c) => (
            <button
              key={c.slug}
              type="button"
              role="radio"
              aria-checked={category === c.slug}
              onClick={() => setCategory(c.slug)}
              className={cn(
                "rounded-full border px-3 py-1.5 font-hud text-[10px] font-bold uppercase tracking-[0.15em] transition",
                category === c.slug
                  ? "border-white/50 bg-zinc-100 text-black"
                  : "border-white/12 text-zinc-400 hover:border-white/30 hover:text-zinc-200",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-rose-300">
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <span className="font-hud text-[10px] uppercase tracking-widest text-zinc-600">
            {title.length}/{MAX_TITLE} · {content.length}/{MAX_CONTENT}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {compact && (
              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  setError("");
                }}
                className="rounded-full px-4 py-2 text-sm text-zinc-400 transition hover:text-white"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={busy || title.trim().length < 3 || !content.trim()}
              className="rounded-full bg-zinc-100 px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-white active:scale-95 disabled:opacity-30"
            >
              {busy ? "Posting…" : "Post"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
