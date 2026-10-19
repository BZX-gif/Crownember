import { NextResponse } from "next/server";
import { getSessionUser, type AuthUser } from "@/lib/auth";
import { enforceAbuseRule, gateVerdict } from "@/lib/moderation";
import {
  groupErrorStatus,
  type GroupResult,
} from "@/lib/groups/service";

/**
 * Shared plumbing for every `/api/groups/*` route.
 *
 * Keeping it in one file is the point: no route is allowed to invent its own
 * status codes or error copy, because the difference between 403 and 404 is a
 * privacy leak for a private group.
 */

export const UNAUTHORIZED = NextResponse.json({ error: "Log in first." }, { status: 401 });

/**
 * Same-origin check for every group mutation.
 *
 * VYRON's session cookie is `SameSite=Lax`, which already blocks cross-site
 * JSON POSTs (a cross-origin `fetch` with a JSON content type needs a CORS
 * preflight, and nothing here sends CORS headers). The gap Lax leaves is a
 * cross-site `<form enctype="multipart/form-data">`, which a browser will post
 * with cookies attached — that is exactly the shape of the picture upload.
 *
 * So every mutating group route asks this first. It trusts only
 * browser-controlled headers (`Origin`, `Sec-Fetch-Site`), which a page cannot
 * spoof from script. Requests with no Origin and no Sec-Fetch-Site (curl, a
 * server-side call, an integration test) are allowed through: they are not
 * browser-driven, so they are not CSRF.
 */
export function sameOriginGuard(req: Request): NextResponse | null {
  const site = req.headers.get("sec-fetch-site");
  if (site === "same-origin" || site === "same-site") return null;
  if (site === "cross-site" || site === "none") {
    return NextResponse.json({ error: "Cross-site group requests are blocked." }, { status: 403 });
  }

  const origin = req.headers.get("origin");
  if (!origin) return null;
  try {
    const url = new URL(req.url);
    if (new URL(origin).host === url.host) return null;
  } catch {
    return NextResponse.json({ error: "Malformed request origin." }, { status: 400 });
  }
  return NextResponse.json({ error: "Cross-site group requests are blocked." }, { status: 403 });
}

/** Turn a service result into a response. Failures never explain themselves
 *  beyond what the actor is allowed to know. */
export function groupResponse<T>(result: GroupResult<T>, onSuccess?: (data: T) => Response) {
  if (result.ok) {
    return onSuccess ? onSuccess(result.data) : NextResponse.json(result.data);
  }
  return NextResponse.json(
    { error: result.error },
    { status: result.status ?? groupErrorStatus(result.code) },
  );
}

/** Parse `params.id` the Next 16 way (a promise) and reject junk ids. */
export async function readGroupId(params: Promise<{ id: string }>): Promise<number | null> {
  const { id } = await params;
  const groupId = Number(id);
  if (!Number.isInteger(groupId) || groupId <= 0) return null;
  return groupId;
}

export async function readJsonBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * The same write gate the forum and chat routes use: exiled and muted accounts
 * cannot create or reshape groups, and abusive text earns a strike.
 */
export async function groupWriteGate(
  user: AuthUser,
  text: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const gate = gateVerdict(user);
  if (gate) {
    return {
      ok: false,
      response: NextResponse.json({ error: gate.error, code: gate.code }, { status: 403 }),
    };
  }
  const verdict = await enforceAbuseRule(user, text);
  if (!verdict.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: verdict.error, code: verdict.code }, { status: 403 }),
    };
  }
  return { ok: true };
}

export { getSessionUser };
