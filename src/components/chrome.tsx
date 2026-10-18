"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import type { PublicUser } from "@/lib/utils";

/** VYRON site chrome; chat and DM routes remain full-screen. */
export function Chrome({ user, children }: { user: PublicUser | null; children: ReactNode }) {
  const pathname = usePathname();
  const isChat = pathname === "/chat" || pathname?.startsWith("/chat/") === true || pathname === "/messages" || pathname?.startsWith("/messages/") === true;
  if (isChat) return <div className="h-[100dvh] overflow-hidden">{children}</div>;
  return (
    <>
      <a
        href="#main-content"
        className="skip-link bg-zinc-100 px-4 py-2 font-hud text-xs font-bold uppercase tracking-widest text-black"
      >
        Skip to content
      </a>
      <Navbar user={user} />
      <main id="main-content" className="min-h-[70vh]">
        {children}
      </main>
      <Footer />
    </>
  );
}
