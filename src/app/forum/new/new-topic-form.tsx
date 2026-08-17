"use client";

import { useState } from "react";
import { CATEGORIES } from "@/lib/utils";

const MAX_TITLE = 120;
const MAX_CONTENT = 4000;

export function NewTopicForm() {
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
        setError(data.error ?? "Failed to create topic.");
        return;
      }
      window.location.href = `/forum/${data.topic.id}`;
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-5">
      <div>
        <label
          htmlFor="title"
          className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400"
        >
          Title *
        </label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
          placeholder="e.g. Best drop spots in Bermuda this season?"
          className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-base sm:text-sm text-white placeholder:text-slate-600 focus:border-orange-500/60 focus:outline-none"
        />
        <p className="mt-1 text-right text-[11px] text-slate-500">
          {title.length}/{MAX_TITLE}
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
          Category
        </label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => setCategory(c.slug)}
              className={
                category === c.slug
                  ? "rounded-full border border-orange-500/50 bg-orange-500/15 px-4 py-2 text-sm font-bold text-orange-400"
                  : "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-slate-300 transition hover:border-white/25"
              }
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label
          htmlFor="content"
          className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400"
        >
          Body *
        </label>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value.slice(0, MAX_CONTENT))}
          rows={10}
          placeholder="Give the community the details: loadout, UID, rules, story…"
          className="nice-scroll w-full resize-y rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-base sm:text-sm text-white placeholder:text-slate-600 focus:border-orange-500/60 focus:outline-none"
        />
        <p className="mt-1 text-right text-[11px] text-slate-500">
          {content.length}/{MAX_CONTENT}
        </p>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || title.trim().length < 3 || !content.trim()}
        className="rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-7 py-3.5 text-sm font-black text-slate-950 shadow-lg shadow-orange-500/25 transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
      >
        {busy ? "Posting…" : "Post Topic · +10 XP"}
      </button>
    </form>
  );
}
