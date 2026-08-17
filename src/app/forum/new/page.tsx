import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { NewTopicForm } from "./new-topic-form";

export const metadata = { title: "New Topic" };

export default async function NewTopicPage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <span className="text-5xl">🔒</span>
        <h1 className="mt-4 text-2xl font-black italic">
          Log In To <span className="text-fire">Start A Topic</span>
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Topics earn +10 XP. Great posts get likes — and likes make you
          legendary.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/login"
            className="rounded-xl border border-white/15 px-6 py-3 text-sm font-bold transition hover:bg-white/10"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-3 text-sm font-black text-slate-950 transition hover:brightness-110"
          >
            Join Free
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-black italic">
        Start A <span className="text-fire">Topic</span>
      </h1>
      <p className="mt-1 text-sm text-slate-400">
        Share your knowledge, find a squad, or start a war story thread.
      </p>
      <NewTopicForm />
    </div>
  );
}
