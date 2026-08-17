import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  checkRateLimit,
  clientIp,
  tooManyRequests,
} from "@/lib/rate-limit";
import {
  getVaultPasscodeHash,
  mintVaultToken,
  setVaultPasscode,
  VAULT_ACCESS_DAYS,
  VAULT_COOKIE,
  verifyVaultPasscode,
} from "@/lib/vault";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = checkRateLimit(`vault-unlock:${ip}`, 5, 15 * 60 * 1000);
  if (!rl.allowed) {
    return tooManyRequests(rl.retryInMs, "vault attempts");
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Log in before approaching The Vault." },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const passcode = String(body.passcode ?? "");

  const existingHash = await getVaultPasscodeHash();

  if (!existingHash) {
    // Key-forging mode: the Vault has no key yet. Only a Founding Squad
    // member may forge it.
    if (!user.founder) {
      return NextResponse.json(
        { error: "Only a 🛡️ Founding Squad member can forge the Vault key." },
        { status: 403 },
      );
    }
    if (passcode.length < 6 || passcode.length > 64) {
      return NextResponse.json(
        { error: "Vault key must be 6-64 characters." },
        { status: 400 },
      );
    }
    await setVaultPasscode(passcode);
  } else {
    const ok = await verifyVaultPasscode(passcode);
    if (!ok) {
      return NextResponse.json(
        { error: "Wrong passcode. This attempt has been logged 🚨" },
        { status: 401 },
      );
    }
  }

  const token = await mintVaultToken(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(VAULT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: VAULT_ACCESS_DAYS * 86400,
  });
  return res;
}
