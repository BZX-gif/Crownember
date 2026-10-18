import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getSeatStats } from "@/lib/access";
import { RegisterForm } from "./register-form";
import { WaitlistGate } from "./waitlist-gate";

export const dynamic = "force-dynamic";

export const metadata = { title: "Join VYRON" };

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect("/");

  const seats = await getSeatStats();

  return (
    <div className="bg-grid-subtle flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        {seats.open ? (
          <>
            {/* Live seat banner */}
            <div className="mb-4 vyron-corners rounded-2xl border border-white/20 bg-white/5 p-4">
              <div className="flex items-center justify-between text-xs font-black">
                <span className="uppercase tracking-wider text-white/70">
                  ⚡ Founding Access · Seat #{seats.taken + 1} of {seats.max}
                </span>
                <span className="text-white">
                  {seats.left} LEFT
                </span>
              </div>
              <div className="mt-2 grid grid-cols-10 gap-1">
                {Array.from({ length: seats.max }, (_, i) => (
                  <span
                    key={i}
                    className={
                      i < seats.taken
                        ? "h-2.5 rounded-full bg-gradient-to-r from-white to-white/60"
                        : "h-2.5 animate-pulse rounded-full border border-dashed border-white/20"
                    }
                  />
                ))}
              </div>
              <p className="mt-2 text-[11px] font-semibold text-white/50">
                Claim a seat now → earn the 🛡️ FOUNDER badge for life. When
                it&apos;s full, it&apos;s full.
              </p>
            </div>

            <div className="vyron-corners rounded-3xl border border-white/10 bg-black/80 p-8 shadow-2xl backdrop-blur">
              <div className="text-center">
                <svg width="64" height="64" viewBox="0 0 32 32" fill="none" aria-hidden="true" className="mx-auto">
                  <rect width="32" height="32" rx="6" fill="currentColor"/>
                  <path d="M8 12h16M8 16h12M8 20h8" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
                  <circle cx="26" cy="6" r="4" fill="#fff" opacity="0.15"/>
                </svg>
                <h1 className="mt-4 font-display text-2xl uppercase tracking-wide">
                  Create Your <span className="text-vyron">Account</span>
                </h1>
                <p className="mt-2 text-sm text-white/50">
                  10 seconds. Zero cost. Join the conversation.
                </p>
              </div>
              <RegisterForm seatNumber={seats.taken + 1} maxSeats={seats.max} />
            </div>
          </>
        ) : (
          <WaitlistGate
            taken={seats.taken}
            max={seats.max}
            initialWaitlistCount={seats.waitlistCount}
          />
        )}
      </div>
    </div>
  );
}