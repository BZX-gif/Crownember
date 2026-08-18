import type { Metadata } from "next";
import { JetBrains_Mono, Russo_One, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { Chrome } from "@/components/chrome";
import { NotificationCenter } from "@/components/notification-center";
import { SecurityGuard } from "@/components/security-guard";
import { getSessionUser } from "@/lib/auth";
import { serializeUser } from "@/lib/utils";

const russo = Russo_One({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-russo",
  display: "swap",
});
const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "EMBERCROWN — Free Fire Chat, Squads & Community",
    template: "%s | EMBERCROWN",
  },
  description:
    "The home base of Free Fire players. Live chat that self-destructs, a sealed vault, squad finder, XP ranks and leaderboards. 10 founding seats only. Talk. Squad. BOOYAH!",
  keywords: [
    "Free Fire",
    "FF chat",
    "Free Fire community",
    "FF squads",
    "Booyah",
    "gaming forum",
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
    <html
      lang="en"
      className={`${russo.variable} ${grotesk.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-screen bg-slate-950 font-body text-slate-100 antialiased">
        <SecurityGuard />
        <Chrome user={publicUser}>
          {children}
          <NotificationCenter user={publicUser} />
        </Chrome>
      </body>
    </html>
  );
}
