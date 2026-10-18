import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { serializeUser } from "@/lib/utils";
import { NewTopicForm } from "./new-topic-form";

export const metadata = { title: "New Post" };

export default async function NewTopicPage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="font-hud text-[11px] uppercase tracking-[0.3em] text-zinc-600">
          new post
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">
          Log in to write.
        </h1>
        <p className="mt-3 text-sm text-zinc-500">
          Posts earn +10 XP. Great writing earns likes — and likes build your
          name.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/login"
            className="rounded-full border border-white/15 px-6 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/5"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-zinc-100 px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-white"
          >
            Join VYRON
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="font-hud text-[11px] font-bold uppercase tracking-[0.3em] text-zinc-600">
        new post
      </p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-white">
        Say something worth keeping.
      </h1>
      <p className="mb-6 mt-2 text-sm text-zinc-500">
        Rooms forget; the feed remembers. +10 XP for every post.
      </p>
      <NewTopicForm user={serializeUser(user)} />
    </div>
  );
}
