import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { claimDevFlair } from "@/lib/dev";

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Log in to claim the Developer Crown." },
      { status: 401 },
    );
  }
  const result = await claimDevFlair(user);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ ok: true, dev: true });
}
