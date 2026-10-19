import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Chrome } from "@/components/chrome";
import { SecurityGuard } from "@/components/security-guard";
import { ToastProvider } from "@/components/toast";
import { getSessionUser } from "@/lib/auth";
import { countPendingRequests } from "@/lib/social";
import { serializeUser } from "@/lib/utils";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://crownember.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "VYRON",
  title: {
    default: "VYRON — Conversations worth returning to",
    template: "%s · VYRON",
  },
  description:
    "VYRON is a global social platform for thoughtful conversations: a permanent forum, ephemeral rooms, and direct messages built around real people.",
  keywords: ["social platform", "community", "forum", "discussions", "VYRON"],
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: ["/favicon.ico"],
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "VYRON — Conversations worth returning to",
    description:
      "A global social platform for thoughtful conversations. Permanent forum, ephemeral rooms, real people.",
    type: "website",
    siteName: "VYRON",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "VYRON — Conversations worth returning to",
    description:
      "A global social platform for thoughtful conversations. Permanent forum, ephemeral rooms, real people.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  const publicUser = user ? serializeUser(user) : null;
  const pendingRequests = user ? await countPendingRequests(user.id) : 0;

  return (
    <html lang="en">
      <body className="min-h-screen bg-ink text-fg antialiased">
        <ToastProvider>
          <SecurityGuard />
          <Chrome user={publicUser} pendingRequests={pendingRequests}>
            {children}
          </Chrome>
        </ToastProvider>
      </body>
    </html>
  );
}
