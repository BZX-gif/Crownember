import { NextResponse } from "next/server";
import { containsInjection } from "@/lib/antibot";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { SUPPORTED_IMAGE_MIME_TYPES, validateImageUpload } from "@/lib/images";
import { FREE_MEMBER_LIMIT } from "@/lib/groups/limits";
import {
  createGroup,
  listGroupsForUser,
  MAX_GROUP_DESCRIPTION,
  MAX_GROUP_NAME,
  MIN_GROUP_NAME,
} from "@/lib/groups/service";
import {
  UNAUTHORIZED,
  getSessionUser,
  groupResponse,
  groupWriteGate,
  readJsonBody, sameOriginGuard,} from "@/lib/groups/http";

/**
 * Inline picture at creation time. The full upload route
 * (`/api/groups/[id]/picture`) is the normal path; this only accepts a small
 * data URL so "create with a picture" is one request, and it runs the exact
 * same magic-byte validation.
 */
const MAX_INLINE_PICTURE_BYTES = 512 * 1024;
const DATA_URL_RE = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i;

function readInlinePicture(value: unknown):
  | { ok: true; picture: { bytes: Buffer; mime: string } | null }
  | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") return { ok: true, picture: null };
  const raw = String(value);
  const match = DATA_URL_RE.exec(raw);
  if (!match) {
    return { ok: false, error: "Group pictures must be a JPG, PNG or WebP image." };
  }
  const declared = match[1].toLowerCase();
  if (!(SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(declared)) {
    return { ok: false, error: "Use a JPG, PNG or WebP image." };
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  } catch {
    return { ok: false, error: "That picture could not be read." };
  }
  const image = validateImageUpload({
    bytes,
    declaredType: declared,
    maxBytes: MAX_INLINE_PICTURE_BYTES,
    label: "Group picture",
  });
  if (!image.ok) return { ok: false, error: image.error };
  return { ok: true, picture: { bytes: image.bytes, mime: image.mime } };
}

/** Groups the viewer belongs to. There is no public directory: private means
 *  a non-member cannot even learn which groups exist. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return UNAUTHORIZED;
  const items = await listGroupsForUser(user.id);
  return NextResponse.json({ groups: items, freeMemberLimit: FREE_MEMBER_LIMIT });
}

export async function POST(req: Request) {
  const blocked = sameOriginGuard(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return UNAUTHORIZED;

  const rl = checkRateLimit(`groups-create:${user.id}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) return tooManyRequests(rl.retryInMs, "groups");

  const body = await readJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();

  const gate = await groupWriteGate(user, `${name} ${description}`);
  if (!gate.ok) return gate.response;

  if (containsInjection(name) || containsInjection(description)) {
    return NextResponse.json(
      { error: "Group text cannot contain code or script tags." },
      { status: 400 },
    );
  }
  if (name.length < MIN_GROUP_NAME || name.length > MAX_GROUP_NAME) {
    return NextResponse.json(
      { error: `Group name must be ${MIN_GROUP_NAME}–${MAX_GROUP_NAME} characters.` },
      { status: 400 },
    );
  }
  if (description.length > MAX_GROUP_DESCRIPTION) {
    return NextResponse.json(
      { error: `Description must be under ${MAX_GROUP_DESCRIPTION} characters.` },
      { status: 400 },
    );
  }

  const picture = readInlinePicture(body.picture);
  if (!picture.ok) return NextResponse.json({ error: picture.error }, { status: 400 });

  const result = await createGroup({
    actor: user,
    name,
    description,
    picture: picture.picture,
  });
  return groupResponse(result, (group) =>
    NextResponse.json({ group }, { status: 201 }),
  );
}
