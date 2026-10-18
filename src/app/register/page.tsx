import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getSeatStats } from "@/lib/access";
import { VyMark } from "@/components/icons";
import { RegisterForm } from "./register-form";
import { WaitlistGate } from "./waitlist-gate";

export const dynamic = "force-dynamic";

export const metadata = { title: "Join VYRON" };

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect("/forum");

  // Open by default; the waitlist gate only ever appears when the owner
  // has deliberately capped membership and the cap has filled.
  const seats = await getSeatStats();

  return (
    <div className="bg-grid flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        {seats.open ? (
          <>
            <div className="rounded-3xl border border-white/10 bg-[#0a0a0a] p-8">
              <div className="text-center">
                <VyMark className="mx-auto h-11 w-11" />
                <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-white">
                  Claim your name.
                </h1>
                <p className="mt-2 text-sm text-zinc-500">
                  Ten seconds. Zero cost. Forever yours.
                </p>
              </div>
              <RegisterForm />
            </div>
            <p className="mt-5 text-center text-sm text-zinc-500">
              Already a member?{" "}
              <Link
                href="/login"
                className="font-semibold text-zinc-100 underline underline-offset-4 transition hover:text-white"
              >
                Log in
              </Link>
            </p>
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
