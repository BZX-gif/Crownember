import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { VyMark } from "@/components/icons";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log In" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/forum");

  return (
    <div className="bg-grid flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="rounded-3xl border border-white/10 bg-[#0a0a0a] p-8">
          <div className="text-center">
            <VyMark className="mx-auto h-11 w-11" />
            <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-white">
              Welcome back.
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Pick up right where the conversation left you.
            </p>
          </div>
          <LoginForm />
        </div>
        <p className="mt-5 text-center text-sm text-zinc-500">
          New here?{" "}
          <Link
            href="/register"
            className="font-semibold text-zinc-100 underline underline-offset-4 transition hover:text-white"
          >
            Claim your name
          </Link>
        </p>
      </div>
    </div>
  );
}
