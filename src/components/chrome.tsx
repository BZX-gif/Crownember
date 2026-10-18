"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import type { PublicUser } from "@/lib/utils";

/** Crownember site chrome; chat and DM routes remain full-screen. */
export function Chrome({ user, children }: { user: PublicUser | null; children: ReactNode }) {
  const pathname = usePathname();
  const isChat = pathname === "/chat" || pathname?.startsWith("/chat/") === true || pathname === "/messages" || pathname?.startsWith("/messages/") === true;
  if (isChat) return <div className="h-[100dvh] overflow-hidden">{children}</div>;
  return (
    <>
      <a
        href="#main-content"
        className="skip-link clip-tag bg-orange-500 px-4 py-2 font-display text-xs uppercase tracking-widest text-slate-950"
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
