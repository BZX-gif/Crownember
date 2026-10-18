import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Chrome } from "@/components/chrome";
import { NotificationCenter } from "@/components/notification-center";
import { SecurityGuard } from "@/components/security-guard";
import { getSessionUser } from "@/lib/auth";
import { serializeUser } from "@/lib/utils";

/* System font stacks — no external dependencies, works everywhere.
 * CSS variables are defined in globals.css for consistency. */
const fontDisplayVariable = "--font-russo";
const fontBodyVariable = "--font-grotesk";
const fontHudVariable = "--font-jetbrains";

export const metadata: Metadata = {
  metadataBase: new URL("https://crownember.vercel.app"),
  title: {
    default: "VYRON — Global Social Platform",
    template: "%s | VYRON",
  },
  description:
    "VYRON — a premium global social platform. Share thoughts, join conversations, build your presence. Luxury design, zero compromise.",
  keywords: [
    "social platform",
    "global community",
    "discussions",
    "social network",
    "VYRON",
  ],
  openGraph: {
    title: "VYRON — Global Social Platform",
    description: "A premium global social platform. Share thoughts, join conversations, build your presence.",
    type: "website",
    siteName: "VYRON",
  },
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getSessionUser();
  const publicUser = user ? serializeUser(user) : null;
  return (
    <html
      lang="en"
      className={`${fontDisplayVariable} ${fontBodyVariable} ${fontHudVariable}`}
    >
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        {/* Preconnect to Google Fonts for production (optional enhancement) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-black font-body text-white antialiased">
        <SecurityGuard />
        <Chrome user={publicUser}>
          {children}
          <NotificationCenter user={publicUser} />
        </Chrome>
      </body>
    </html>
  );
}