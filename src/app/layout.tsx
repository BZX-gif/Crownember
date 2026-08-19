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
    default: "CLUTCHZONE — Free Fire Gaming Community",
    template: "%s | CLUTCHZONE",
  },
  description:
    "CLUTCHZONE — where Free Fire players connect. Chat, find squads, build your player profile, discuss the game and compete with the community.",
  keywords: [
    "Free Fire",
    "Free Fire community",
    "Free Fire gaming community",
    "FF chat",
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
      <body
        data-current-username={publicUser?.username ?? ""}
        className="min-h-screen bg-slate-950 font-body text-slate-100 antialiased"
      >
        <SecurityGuard />
        <Chrome user={publicUser}>
          {children}
          <NotificationCenter user={publicUser} />
        </Chrome>
      </body>
    </html>
  );
}
