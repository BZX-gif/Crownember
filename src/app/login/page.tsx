import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log In" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/");

  return (
    <div className="bg-grid-subtle flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="vyron-corners rounded-3xl border border-white/10 bg-black/80 p-8 shadow-2xl backdrop-blur">
          <div className="text-center">
            <svg width="64" height="64" viewBox="0 0 32 32" fill="none" aria-hidden="true" className="mx-auto">
              <rect width="32" height="32" rx="6" fill="currentColor"/>
              <path d="M8 12h16M8 16h12M8 20h8" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
              <circle cx="26" cy="6" r="4" fill="#fff" opacity="0.15"/>
            </svg>
            <h1 className="mt-4 font-display text-2xl uppercase tracking-wide">
              Welcome Back
            </h1>
            <p className="mt-2 text-sm text-white/50">
              Your conversations are waiting. Sign in to continue.
            </p>
          </div>
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-sm text-white/40">
          New here?{" "}
          <a href="/register" className="font-bold text-white hover:underline">
            Create a free account
          </a>
        </p>
      </div>
    </div>
  );
}