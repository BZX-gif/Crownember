"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar, RankBadge } from "@/components/ui";
import { EmptyState, Notice, buttonClass } from "@/components/primitives";
import { CheckIcon, MailIcon, UsersIcon, XIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { timeAgo, type PublicUser } from "@/lib/utils";

interface ThreadRow {
  other: PublicUser;
  lastContent: string;
  lastAt: string;
  lastFromMe: boolean;
}

export function DmInbox({
  friends,
  incoming,
  outgoing,
  threads,
  pendingCount,
}: {
  friends: PublicUser[];
  incoming: PublicUser[];
  outgoing: PublicUser[];
  threads: ThreadRow[];
  pendingCount: number;
}) {
  const { toast } = useToast();
  const [incomingList, setIncomingList] = useState(incoming);
  const [outgoingList, setOutgoingList] = useState(outgoing);
  const [friendList, setFriendList] = useState(friends);
  const [busyName, setBusyName] = useState("");
  const [error, setError] = useState("");

  async function respond(username: string, accept: boolean) {
    if (busyName) return;
    setBusyName(username);
    setError("");
    try {
      const res = await fetch(
        accept ? "/api/friends/accept" : "/api/friends/decline",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "That request could not be completed.");
        return;
      }
      const person = incomingList.find((u) => u.username === username);
      setIncomingList((list) => list.filter((u) => u.username !== username));
      if (accept && person) {
        setFriendList((list) => [person, ...list]);
        toast({ title: `You and ${username} are friends`, variant: "success" });
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusyName("");
    }
  }

  async function cancel(username: string) {
    if (busyName) return;
    setBusyName(username);
    setError("");
    try {
      const res = await fetch("/api/friends/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) {
        setError("That request could not be withdrawn.");
        return;
      }
      setOutgoingList((list) => list.filter((u) => u.username !== username));
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusyName("");
    }
  }

  return (
    <div className="mt-7">
      {pendingCount > 0 && (
        <p className="mb-3 text-[11px] text-muted">
          {pendingCount === 1
            ? "One friend request is waiting."
            : `${pendingCount} friend requests are waiting.`}
        </p>
      )}

      {error && (
        <Notice variant="error" className="mb-4">
          {error}
        </Notice>
      )}

      {incomingList.length > 0 && (
        <section className="mb-7" aria-labelledby="requests-heading">
          <h2 id="requests-heading" className="mb-2.5 text-xs font-medium text-fg">
            Friend requests
          </h2>
          <ul className="space-y-1.5">
            {incomingList.map((person) => (
              <li
                key={person.id}
                className="flex items-center gap-3 rounded-lg border border-line bg-panel p-3"
              >
                <Avatar name={person.username} size={36} dev={person.dev} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/players/${encodeURIComponent(person.username)}`}
                    className="block truncate text-[13px] font-medium text-fg hover:underline"
                  >
                    {person.username}
                  </Link>
                  <p className="mt-0.5 text-[10px] text-subtle">
                    {person.rank.name} · {person.xp.toLocaleString()} XP
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => void respond(person.username, true)}
                    disabled={busyName === person.username}
                    className={buttonClass("primary", "sm", "h-7 px-2.5 text-[11px]")}
                  >
                    <CheckIcon size={12} /> Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => void respond(person.username, false)}
                    disabled={busyName === person.username}
                    className={buttonClass("ghost", "sm", "h-7 px-2 text-[11px] text-subtle")}
                    aria-label={`Decline request from ${person.username}`}
                  >
                    <XIcon size={13} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="threads-heading">
        <div className="flex items-center justify-between gap-3 border-b border-line pb-2.5">
          <h2 id="threads-heading" className="text-xs font-medium text-fg">
            Conversations
          </h2>
          <Link
            href="/players"
            className="inline-flex items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-fg"
          >
            <UsersIcon size={12} /> Find people
          </Link>
        </div>

        {threads.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={<MailIcon size={17} />}
            title="No conversations yet"
            description="Message a member from their profile, or accept a friend request to start talking."
            action={
              <Link href="/players" className={buttonClass("secondary", "sm")}>
                Browse people
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {threads.map((thread) => (
              <li key={thread.other.id}>
                <Link
                  href={`/messages/${encodeURIComponent(thread.other.username)}`}
                  className="flex items-center gap-3 py-3.5 transition-colors hover:bg-white/[0.02]"
                >
                  <Avatar name={thread.other.username} size={38} dev={thread.other.dev} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-fg">
                        {thread.other.username}
                      </span>
                      <RankBadge rank={thread.other.rank} size="xs" />
                      <span className="ml-auto shrink-0 text-[10px] text-subtle">
                        {timeAgo(thread.lastAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {thread.lastFromMe && (
                        <span className="text-subtle">You: </span>
                      )}
                      {thread.lastContent}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {outgoingList.length > 0 && (
        <section className="mt-7" aria-labelledby="sent-heading">
          <h2 id="sent-heading" className="mb-2.5 text-xs font-medium text-fg">
            Sent requests
          </h2>
          <ul className="space-y-1.5">
            {outgoingList.map((person) => (
              <li
                key={person.id}
                className="flex items-center gap-3 rounded-lg border border-line px-3 py-2"
              >
                <Avatar name={person.username} size={28} dev={person.dev} />
                <Link
                  href={`/players/${encodeURIComponent(person.username)}`}
                  className="min-w-0 flex-1 truncate text-[12px] text-fg hover:underline"
                >
                  {person.username}
                </Link>
                <button
                  type="button"
                  onClick={() => void cancel(person.username)}
                  disabled={busyName === person.username}
                  className="shrink-0 text-[10px] text-subtle transition-colors hover:text-fg"
                >
                  {busyName === person.username ? "Withdrawing…" : "Withdraw"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {friendList.length > 0 && (
        <section className="mt-7" aria-labelledby="friends-heading">
          <h2 id="friends-heading" className="mb-2.5 text-xs font-medium text-fg">
            Friends
          </h2>
          <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {friendList.map((person) => (
              <li key={person.id}>
                <Link
                  href={`/messages/${encodeURIComponent(person.username)}`}
                  className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-2 transition-colors hover:border-line-strong"
                >
                  <Avatar name={person.username} size={26} dev={person.dev} />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-fg">
                    {person.username}
                  </span>
                  <MailIcon size={12} className="shrink-0 text-subtle" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
