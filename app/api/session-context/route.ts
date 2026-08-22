import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createFriendComputerSupabase } from "@/lib/fc-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["PLANNING", "ACTIVE", "PAUSED", "COMPLETE"] as const;

function secureMatch(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cleanSingleLine(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, maxLength);
}

function cleanBlock(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\r/g, "").trim().slice(0, maxLength);
}

export async function POST(request: NextRequest) {
  const gmKey = process.env.FRIEND_COMPUTER_GM_KEY;
  if (!gmKey) {
    return NextResponse.json({ error: "Friend Computer GM authorization is not configured." }, { status: 503 });
  }

  const providedKey = request.headers.get("x-friend-computer-gm-key") ?? "";
  if (!secureMatch(providedKey, gmKey)) {
    return NextResponse.json({ error: "GM authorization rejected." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid session context request." }, { status: 400 });
  }

  const room = cleanSingleLine(body.room, 96);
  const action = cleanSingleLine(body.action, 24);
  if (!room) return NextResponse.json({ error: "Room is required." }, { status: 400 });

  const supabase = createFriendComputerSupabase();

  if (action === "get") {
    const { data, error } = await supabase.rpc("fc_get_session_context", {
      p_room: room,
      p_gm_key: providedKey,
    });
    if (error) {
      console.error("Session context read failed", error.message);
      return NextResponse.json({ error: "Unable to load persistent session context." }, { status: 502 });
    }
    const context = Array.isArray(data) && data.length > 0 ? data[0] : null;
    return NextResponse.json({ context }, { headers: { "Cache-Control": "no-store" } });
  }

  if (action === "save") {
    const status = cleanSingleLine(body.status, 16).toUpperCase();
    if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
      return NextResponse.json({ error: "Invalid session status." }, { status: 400 });
    }

    const missionTitle = cleanSingleLine(body.missionTitle, 160);
    const location = cleanSingleLine(body.location, 160);
    const scene = cleanSingleLine(body.scene, 240);
    const currentObjective = cleanBlock(body.currentObjective, 500);
    const publicContext = cleanBlock(body.publicContext, 4000);
    const gmGuidance = cleanBlock(body.gmGuidance, 4000);

    const { data, error } = await supabase.rpc("fc_upsert_session_context", {
      p_room: room,
      p_gm_key: providedKey,
      p_status: status,
      p_mission_title: missionTitle,
      p_location: location,
      p_scene: scene,
      p_current_objective: currentObjective,
      p_public_context: publicContext,
      p_gm_guidance: gmGuidance,
    });
    if (error || data !== true) {
      console.error("Session context write failed", error?.message ?? "rpc rejected");
      return NextResponse.json({ error: "Unable to save persistent session context." }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown session context action." }, { status: 400 });
}
