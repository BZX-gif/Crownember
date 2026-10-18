import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { Chrome } from "@/components/chrome";
import { NotificationBell } from "@/components/notification-bell";
import { SecurityGuard } from "@/components/security-guard";
import { getSessionUser } from "@/lib/auth";
import { serializeUser } from "@/lib/utils";

export const metadata: Metadata = {
  metadataBase: new URL("https://crownember.vercel.app"),
  title: {
    default: "VYRON — The Global Social Platform",
    template: "%s | VYRON",
  },
  description:
    "VYRON is a global social platform: a beautiful permanent feed, live rooms that fade into the night, private messages, and a sealed Vault. Premium, calm, and free forever.",
  keywords: [
    "VYRON",
    "social platform",
    "global community",
    "social feed",
    "live chat rooms",
    "private messaging",
  ],
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getSessionUser();
  const publicUser = user ? serializeUser(user) : null;
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#050505] font-body text-zinc-100 antialiased">
        <SecurityGuard />
        <Chrome user={publicUser}>
          {children}
          <NotificationBell user={publicUser} floating />
        </Chrome>
      </body>
    </html>
  );
}
