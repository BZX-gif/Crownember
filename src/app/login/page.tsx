import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { Brand } from "@/components/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your VYRON account.",
};

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/");

  return (
    <div className="mx-auto grid min-h-[calc(100dvh-140px)] w-full max-w-5xl items-center gap-12 px-5 py-12 lg:grid-cols-2 lg:gap-20">
      <div className="hidden lg:block">
        <Brand size={30} />
        <h1 className="display-title mt-10 text-4xl leading-[1.1] text-fg">
          The conversation
          <br />
          remembers you.
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
          Your posts, replies and reputation are tied to one account. Sign in to
          pick up where you left off.
        </p>
        <ul className="mt-8 space-y-2.5 text-xs text-muted">
          <li className="flex items-center gap-2.5">
            <span className="h-px w-4 bg-line-strong" aria-hidden="true" />
            Real conversations, no algorithmic feed
          </li>
          <li className="flex items-center gap-2.5">
            <span className="h-px w-4 bg-line-strong" aria-hidden="true" />
            Reputation earned by contributing
          </li>
          <li className="flex items-center gap-2.5">
            <span className="h-px w-4 bg-line-strong" aria-hidden="true" />
            Free to join, no advertising
          </li>
        </ul>
      </div>

      <div className="mx-auto w-full max-w-sm">
        <div className="lg:hidden">
          <Brand size={28} />
        </div>
        <div className="mt-6 rounded-xl border border-line bg-panel p-6 sm:p-7 lg:mt-0">
          <p className="eyebrow">Welcome back</p>
          <h1 className="display-title mt-2 text-2xl text-fg">Sign in</h1>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            Enter the username and password you registered with.
          </p>
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-muted">
          No account?{" "}
          <Link href="/register" className="text-fg underline underline-offset-4">
            Join VYRON
          </Link>
        </p>
      </div>
    </div>
  );
}
