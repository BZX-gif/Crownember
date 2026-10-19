import Link from "next/link";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { NewTopicForm } from "./new-topic-form";
import { PageHeader, buttonClass } from "@/components/primitives";
import { LockIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "New conversation",
};

export default async function NewTopicPage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <div className="page-shell max-w-xl py-16 sm:py-20">
        <div className="rounded-xl border border-line bg-panel p-8 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-line text-muted">
            <LockIcon size={18} />
          </span>
          <h1 className="display-title mt-5 text-3xl text-fg">Sign in to write</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
            Conversations are tied to a real member so people can reply to you,
            follow your work and build reputation together.
          </p>
          <div className="mt-6 flex justify-center gap-2.5">
            <Link href="/login" className={buttonClass("secondary", "md")}>
              Sign in
            </Link>
            <Link href="/register" className={buttonClass("primary", "md")}>
              Join VYRON
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell py-9 sm:py-12">
      <PageHeader
        eyebrow="Forum"
        title="Start a conversation"
        description="Write something worth replying to. The permanent archive is made of real posts from real members."
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_250px]">
        <NewTopicForm />

        <aside className="order-first space-y-4 lg:order-last">
          <div className="rounded-xl border border-line bg-panel p-4">
            <p className="text-xs font-medium text-fg">Before you post</p>
            <ul className="mt-2.5 space-y-2 text-[11px] leading-relaxed text-muted">
              <li>Ask a clear question or make a specific point.</li>
              <li>Add context. “It depends” is not a conversation.</li>
              <li>Reply to people, not at them.</li>
              <li>Abuse is blocked and rate limits apply.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-line p-4">
            <p className="text-xs font-medium text-fg">What you earn</p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Publishing a post adds 10 XP to your reputation. Replies add 5 XP.
              Reputation cannot be bought.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
