"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import type { PublicUser } from "@/lib/utils";

/**
 * Site chrome. Rooms and direct messages are full-height application screens
 * with their own app bars, so the marketing footer and top navigation are not
 * stacked around them.
 */
export function Chrome({
  user,
  pendingRequests = 0,
  children,
}: {
  user: PublicUser | null;
  pendingRequests?: number;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const isAppScreen =
    pathname === "/chat" ||
    pathname.startsWith("/chat/") ||
    pathname === "/messages" ||
    pathname.startsWith("/messages/");

  if (isAppScreen) {
    return <div className="h-[100dvh] overflow-hidden">{children}</div>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="skip-link rounded-lg bg-fg px-4 py-2 text-xs font-medium text-ink"
      >
        Skip to content
      </a>
      <Navbar user={user} pendingRequests={pendingRequests} />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
