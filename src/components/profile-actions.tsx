"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Notice, buttonClass } from "@/components/primitives";
import { LockIcon, MailIcon, UserIcon, XIcon, CheckIcon, UnlockIcon } from "@/components/icons";
import { useToast } from "@/components/toast";

type Relationship = "self" | "friends" | "outgoing" | "incoming" | "none";

export function ProfileActions({
  targetUsername,
  relationship: initialRel,
  iBlockedThem: initialBlocked,
  theyBlockedMe,
}: {
  targetUsername: string;
  relationship: Relationship;
  iBlockedThem: boolean;
  theyBlockedMe: boolean;
}) {
  const { toast } = useToast();
  const [rel, setRel] = useState<Relationship>(initialRel);
  const [iBlockedThem, setIBlockedThem] = useState(initialBlocked);
  const [busy, setBusy] = useState("");
  const [flash, setFlash] = useState("");

  const sealed = iBlockedThem || theyBlockedMe;

  async function call(path: string, action: string) {
    if (busy) return null;
    setBusy(action);
    setFlash("");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: targetUsername }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        autoAccepted?: boolean;
        blocked?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setFlash(data.error ?? "That action could not be completed.");
        toast({
          title: "Action failed",
          description: data.error ?? "Try again in a moment.",
          variant: "danger",
        });
        return null;
      }
      if (data.message) setFlash(data.message);
      return data;
    } catch {
      setFlash("Network error — try again.");
      toast({ title: "Network error", variant: "danger" });
      return null;
    } finally {
      setBusy("");
    }
  }

  async function onFriend() {
    const data = await call("/api/friends/request", "friend");
    if (data?.ok) {
      setRel(data.autoAccepted ? "friends" : "outgoing");
      toast({
        title: data.autoAccepted ? "You are now friends" : "Friend request sent",
        variant: "success",
      });
    }
  }
  async function onAccept() {
    const data = await call("/api/friends/accept", "accept");
    if (data?.ok) {
      setRel("friends");
      toast({ title: "Friend request accepted", variant: "success" });
    }
  }
  async function onDecline() {
    const data = await call("/api/friends/decline", "decline");
    if (data?.ok) setRel("none");
  }
  async function onRemove() {
    const data = await call("/api/friends/remove", "remove");
    if (data?.ok) setRel("none");
  }
  async function onBlock() {
    const data = await call("/api/block/toggle", "block");
    if (data?.ok) {
      setIBlockedThem(Boolean(data.blocked));
      if (data.blocked) setRel("none");
      toast({
        title: data.blocked ? "Member blocked" : "Member unblocked",
        description: data.blocked
          ? "Neither of you will see the other's content."
          : "You may see each other's public content again.",
        variant: "success",
      });
    }
  }

  if (rel === "self") return null;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        {iBlockedThem ? (
          <Button variant="secondary" size="sm" onClick={() => void onBlock()} loading={busy === "block"}>
            <UnlockIcon size={14} /> Unblock
          </Button>
        ) : theyBlockedMe ? (
          <span className={buttonClass("secondary", "sm", "pointer-events-none opacity-70")}>
            <LockIcon size={14} /> Unavailable
          </span>
        ) : (
          <>
            {rel === "none" && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => void onFriend()}
                loading={busy === "friend"}
              >
                <UserIcon size={14} /> Add friend
              </Button>
            )}
            {rel === "outgoing" && (
              <>
                <span className={buttonClass("secondary", "sm", "pointer-events-none text-muted")}>
                  Request sent
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void onRemove()}
                  loading={busy === "remove"}
                >
                  Cancel
                </Button>
              </>
            )}
            {rel === "incoming" && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void onAccept()}
                  loading={busy === "accept"}
                >
                  <CheckIcon size={14} /> Accept
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void onDecline()}
                  loading={busy === "decline"}
                >
                  Decline
                </Button>
              </>
            )}
            {rel === "friends" && (
              <>
                <span className={buttonClass("secondary", "sm", "pointer-events-none")}>
                  <CheckIcon size={14} /> Friends
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void onRemove()}
                  loading={busy === "remove"}
                >
                  Remove
                </Button>
              </>
            )}
            <Link
              href={`/messages/${encodeURIComponent(targetUsername)}`}
              className={buttonClass("secondary", "sm")}
            >
              <MailIcon size={14} /> Message
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void onBlock()}
              loading={busy === "block"}
              className="text-subtle hover:text-danger"
              title="Block this member"
            >
              <XIcon size={14} /> Block
            </Button>
          </>
        )}
      </div>
      {flash && !sealed && (
        <Notice className="mt-2.5" variant="info">
          {flash}
        </Notice>
      )}
    </div>
  );
}
