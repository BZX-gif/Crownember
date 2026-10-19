import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { groups } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { avatarVersion } from "@/lib/utils";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { MAX_IMAGE_BYTES, safeServeMime, validateImageFile } from "@/lib/images";
import { GROUP_NOT_FOUND_MESSAGE, requireGroup } from "@/lib/groups/access";
import { setGroupPicture } from "@/lib/groups/service";
import { UNAUTHORIZED, groupResponse, readGroupId, sameOriginGuard } from "@/lib/groups/http";

const NOT_FOUND = new NextResponse(null, {
  status: 404,
  headers: { "Cache-Control": "no-store" },
});

/**
 * Group picture. Members only — unlike a profile avatar, a group's picture is
 * private content, because for a private group the picture itself discloses
 * membership and activity. The response is `private` + ETag for that reason.
 *
 * The served Content-Type is sniffed from the stored bytes, never taken from
 * what a client uploaded (see lib/images.ts).
 */
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const groupId = await readGroupId(context.params);
  if (groupId === null) return NOT_FOUND;

  const user = await getSessionUser();
  if (!user) return NOT_FOUND;

  const guarded = await requireGroup({ groupId, user, permission: "viewContent" });
  if (!guarded.ok) return NOT_FOUND;

  const rows = await db
    .select({
      data: groups.pictureData,
      mime: groups.pictureMime,
      version: groups.pictureVersion,
    })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  const picture = rows[0];
  if (!picture?.data) return NOT_FOUND;

  const mime = safeServeMime(picture.data, picture.mime);
  if (!mime) return NOT_FOUND;

  const etag = `"${avatarVersion(picture.version)}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  return new NextResponse(new Uint8Array(picture.data), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "private, max-age=300, must-revalidate",
      ETag: etag,
    },
  });
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = sameOriginGuard(req);
  if (blocked) return blocked;

  const groupId = await readGroupId(context.params);
  if (groupId === null) return NextResponse.json({ error: GROUP_NOT_FOUND_MESSAGE }, { status: 404 });

  const user = await getSessionUser();
  if (!user) return UNAUTHORIZED;

  const rl = checkRateLimit(`groups-picture:${user.id}`, 15, 60 * 60 * 1000);
  if (!rl.allowed) return tooManyRequests(rl.retryInMs, "picture uploads");

  const guarded = await requireGroup({ groupId, user, permission: "updateDetails" });
  if (!guarded.ok) {
    return NextResponse.json({ error: guarded.error }, { status: guarded.status });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  const value = form.get("picture");
  if (!(value instanceof File)) {
    return NextResponse.json({ error: "Choose an image first." }, { status: 400 });
  }

  const image = await validateImageFile(value, { maxBytes: MAX_IMAGE_BYTES, label: "Group picture" });
  if (!image.ok) return NextResponse.json({ error: image.error }, { status: 400 });

  const result = await setGroupPicture(guarded.access, { bytes: image.bytes, mime: image.mime });
  return groupResponse(result, () =>
    NextResponse.json({
      ok: true,
      hasPicture: true,
      pictureVersion: avatarVersion(new Date()),
    }),
  );
}

/** Removing the picture falls back to the group's initials tile. */
export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = sameOriginGuard(req);
  if (blocked) return blocked;

  const groupId = await readGroupId(context.params);
  if (groupId === null) return NextResponse.json({ error: GROUP_NOT_FOUND_MESSAGE }, { status: 404 });

  const guarded = await requireGroup({ groupId, permission: "updateDetails" });
  if (!guarded.ok) {
    return NextResponse.json({ error: guarded.error }, { status: guarded.status });
  }

  const result = await setGroupPicture(guarded.access, null);
  return groupResponse(result, () =>
    NextResponse.json({ ok: true, hasPicture: false, pictureVersion: avatarVersion(new Date()) }),
  );
}
