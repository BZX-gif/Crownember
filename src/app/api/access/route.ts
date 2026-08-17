import { NextResponse } from "next/server";
import { getSeatStats } from "@/lib/access";

export async function GET() {
  return NextResponse.json(await getSeatStats());
}
