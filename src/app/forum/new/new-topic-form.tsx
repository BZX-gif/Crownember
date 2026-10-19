"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATEGORIES } from "@/lib/utils";
import { Button, CategoryGlyph, Field, Input, Notice, Textarea } from "@/components/primitives";
import { useToast } from "@/components/toast";

const MAX_TITLE = 120;
const MAX_CONTENT = 4000;

export function NewTopicForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<string>("general");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (title.trim().length < 3) {
      setError("Give the conversation a title of at least 3 characters.");
      return;
    }
    if (!content.trim()) {
      setError("Add a body so people have something to reply to.");
      return;
    }
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
      const data = (await res.json()) as {
        topic?: { id: number };
        error?: string;
      };
      if (!res.ok || !data.topic) {
        setError(data.error ?? "The post could not be published. Try again.");
        return;
      }
      toast({ title: "Conversation published", variant: "success" });
      router.push(`/forum/${data.topic.id}`);
      router.refresh();
    } catch {
      setError("Network error — your post was not published. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field
        label="Title"
        htmlFor="title"
        hint={`${title.length}/${MAX_TITLE} characters`}
        error={title.length > 0 && title.trim().length < 3 ? "Use at least 3 characters." : undefined}
      >
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
          placeholder="What do you want to talk about?"
          maxLength={MAX_TITLE}
          autoFocus
          required
        />
      </Field>

      <fieldset>
        <legend className="mb-2 text-xs font-medium text-muted">Category</legend>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => setCategory(c.slug)}
              aria-pressed={category === c.slug}
              className={
                category === c.slug
                  ? "inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-white/[0.07] px-3 py-1.5 text-xs font-medium text-fg"
                  : "inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-line-strong hover:text-fg"
              }
            >
              <CategoryGlyph icon={c.icon} size={12} />
              {c.label}
            </button>
          ))}
        </div>
      </fieldset>

      <Field
        label="Body"
        htmlFor="content"
        hint={`${content.length}/${MAX_CONTENT} characters`}
      >
        <Textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value.slice(0, MAX_CONTENT))}
          rows={11}
          maxLength={MAX_CONTENT}
          placeholder="Add the context, the question, or the story. Specific posts get better replies."
          required
          className="min-h-[240px]"
        />
      </Field>

      {error && <Notice variant="error">{error}</Notice>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] text-subtle">
          Posts are public and remain in the archive.
        </p>
        <Button
          type="submit"
          variant="primary"
          size="md"
          loading={busy}
          disabled={!title.trim() || !content.trim()}
        >
          {busy ? "Publishing…" : "Publish conversation"}
        </Button>
      </div>
    </form>
  );
}
