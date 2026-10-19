import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { getSeatStats } from "@/lib/access";
import { Brand } from "@/components/brand";
import { RegisterForm } from "./register-form";
import { WaitlistGate } from "./waitlist-gate";
import { ShieldIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Join VYRON",
  description: "Create a free VYRON account.",
};

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect("/");

  const seats = await getSeatStats();

  return (
    <div className="mx-auto grid w-full max-w-5xl items-start gap-12 px-5 py-12 lg:grid-cols-[1fr_400px] lg:gap-20">
      <div className="hidden lg:block">
        <Brand size={30} />
        <h1 className="display-title mt-10 text-4xl leading-[1.1] text-fg">
          A place to be
          <br />
          taken seriously.
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
          VYRON is a social platform built around conversation instead of
          engagement metrics. Join free, choose a username, and write something
          worth replying to.
        </p>

        <div className="mt-9 max-w-sm rounded-xl border border-line bg-panel p-5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-fg">Founding members</span>
            <span className="mono-meta">
              {seats.taken} of {seats.max} claimed
            </span>
          </div>
          <div className="mt-3 grid grid-cols-10 gap-1" aria-hidden="true">
            {Array.from({ length: seats.max }, (_, index) => (
              <span
                key={index}
                className={
                  index < seats.taken
                    ? "h-1.5 rounded-full bg-fg/80"
                    : "h-1.5 rounded-full bg-white/[0.08]"
                }
              />
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            {seats.left > 0
              ? `${seats.left} founding ${seats.left === 1 ? "seat" : "seats"} remain. Founding members keep a permanent badge and a vote on direction.`
              : "The founding seats are full. The waitlist is open for when a seat is released."}
          </p>
        </div>

        <p className="mt-6 flex items-center gap-2 text-[10px] text-subtle">
          <ShieldIcon size={12} /> Passwords are hashed. Sign-ups are rate-limited.
        </p>
      </div>

      <div className="mx-auto w-full max-w-sm lg:mt-2">
        <div className="lg:hidden">
          <Brand size={28} />
        </div>

        {seats.open ? (
          <div className="mt-6 rounded-xl border border-line bg-panel p-6 sm:p-7 lg:mt-0">
            <p className="eyebrow">Create account</p>
            <h1 className="display-title mt-2 text-2xl text-fg">Join VYRON</h1>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Free, no card, no advertising. A founding seat is reserved for you.
            </p>
            <RegisterForm seatNumber={seats.taken + 1} maxSeats={seats.max} />
            <p className="mt-4 text-center text-[10px] leading-relaxed text-subtle">
              By joining you agree to keep the room civil. Abuse is moderated.
            </p>
          </div>
        ) : (
          <WaitlistGate taken={seats.taken} max={seats.max} />
        )}

        <p className="mt-4 text-center text-xs text-muted">
          Already a member?{" "}
          <Link href="/login" className="text-fg underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
