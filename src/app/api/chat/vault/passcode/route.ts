import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  checkRateLimit,
  clientIp,
  tooManyRequests,
} from "@/lib/rate-limit";
import {
  getVaultUser,
  setVaultPasscode,
  verifyVaultPasscode,
} from "@/lib/vault";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = checkRateLimit(`vault-passcode:${ip}`, 5, 15 * 60 * 1000);
  if (!rl.allowed) {
    return tooManyRequests(rl.retryInMs, "passcode changes");
  }

  const user = await getSessionUser();
  if (!user || !user.founder) {
    return NextResponse.json(
      { error: "Only 🛡️ Founding Squad members can rotate the Vault key." },
      { status: 403 },
    );
  }
  const inside = await getVaultUser();
  if (!inside) {
    return NextResponse.json(
      { error: "The Vault is sealed. Unlock it first." },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const current = String(body.current ?? "");
  const next = String(body.next ?? "");

  if (!(await verifyVaultPasscode(current))) {
    return NextResponse.json(
      { error: "Current key is wrong 🚨" },
      { status: 401 },
    );
  }
  if (next.length < 6 || next.length > 64) {
    return NextResponse.json(
      { error: "New key must be 6-64 characters." },
      { status: 400 },
    );
  }

  await setVaultPasscode(next);
  return NextResponse.json({ ok: true });
}
