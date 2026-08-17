import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log In" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/chat");

  return (
    <div className="bg-grid flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl">
          <div className="text-center">
            <span className="text-4xl">🔥</span>
            <h1 className="mt-2 font-display text-2xl uppercase tracking-wide">
              Welcome Back, <span className="text-fire">Legend</span>
            </h1>
            <p className="mt-1.5 text-sm text-slate-400">
              Your squad missed you. Log in and drop back into the chat.
            </p>
          </div>
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-sm text-slate-400">
          New here?{" "}
          <a href="/register" className="font-bold text-orange-400 hover:underline">
            Create a free account
          </a>
        </p>
      </div>
    </div>
  );
}
