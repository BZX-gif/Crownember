"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import type { PublicUser } from "@/lib/utils";

/**
 * Decides the frame around every page:
 *  - /chat* → chrome-free full-screen messaging (inbox + threads own 100dvh)
 *  - everything else → the full EMBERCROWN site chrome
 * usePathname resolves during server render too, so there is zero flash.
 */
export function Chrome({
  user,
  children,
}: {
  user: PublicUser | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isChat =
    pathname === "/chat" || pathname?.startsWith("/chat/") === true;

  if (isChat) {
    return <div className="h-[100dvh] overflow-hidden">{children}</div>;
  }

  return (
    <>
      <Navbar user={user} />
      <main className="min-h-[70vh]">{children}</main>
      <Footer />
    </>
  );
}
