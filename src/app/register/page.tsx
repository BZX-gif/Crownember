import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getSeatStats } from "@/lib/access";
import { RegisterForm } from "./register-form";
import { WaitlistGate } from "./waitlist-gate";

export const dynamic = "force-dynamic";

export const metadata = { title: "Join Free" };

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect("/chat");

  const seats = await getSeatStats();

  return (
    <div className="bg-grid flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        {seats.open ? (
          <>
            {/* Live seat banner */}
            <div className="mb-4 rounded-2xl border border-orange-500/40 bg-gradient-to-r from-orange-500/15 to-amber-500/5 p-4">
              <div className="flex items-center justify-between text-xs font-black">
                <span className="uppercase tracking-wider text-orange-300">
                  ⚡ Founding Drop · Seat #{seats.taken + 1} of {seats.max}
                </span>
                <span className="text-orange-400">
                  {seats.left} LEFT
                </span>
              </div>
              <div className="mt-2 grid grid-cols-10 gap-1">
                {Array.from({ length: seats.max }, (_, i) => (
                  <span
                    key={i}
                    className={
                      i < seats.taken
                        ? "h-2.5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500"
                        : "h-2.5 animate-pulse rounded-full border border-dashed border-orange-500/50"
                    }
                  />
                ))}
              </div>
              <p className="mt-2 text-[11px] font-semibold text-slate-400">
                Claim a seat now → earn the 🛡️ FOUNDER badge for life. When
                it&apos;s full, it&apos;s full.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl">
              <div className="text-center">
                <span className="text-4xl">🍗</span>
                <h1 className="mt-2 font-display text-2xl uppercase tracking-wide">
                  Create Your <span className="text-fire">Player Account</span>
                </h1>
                <p className="mt-1.5 text-sm text-slate-400">
                  10 seconds. Zero cost. Chat, squad up and rank up.
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
