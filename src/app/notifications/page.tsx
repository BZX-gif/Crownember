import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { NotificationsInbox } from "./inbox";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbox" };

export default async function NotificationsPage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="font-hud text-[11px] uppercase tracking-[0.3em] text-zinc-600">
          inbox
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">
          Your inbox is private.
        </h1>
        <p className="mt-3 text-sm text-zinc-500">
          Log in to see replies, likes and requests.
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
    <div className="mx-auto max-w-xl px-4 py-10">
      <p className="font-hud text-[11px] uppercase tracking-[0.3em] text-zinc-600">
        inbox
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
        Notifications
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Replies, likes and requests — nothing else. No noise by design.
      </p>
      <div className="mt-8">
        <NotificationsInbox />
      </div>
    </div>
  );
}
