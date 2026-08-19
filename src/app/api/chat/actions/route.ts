import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages, rooms, settings, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { containsInjection } from "@/lib/antibot";
import { gateVerdict } from "@/lib/moderation";
import { MAX_MESSAGE_LENGTH, XP_AWARDS } from "@/lib/ranks";
import { serializeMessage } from "@/lib/utils