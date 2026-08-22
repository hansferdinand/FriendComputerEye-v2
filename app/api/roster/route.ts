import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createFriendComputerSupabase } from "@/lib/fc-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLEARANCES = [
  "INFRARED",
  "RED",
  "ORANGE",
  "YELLOW",
  "GREEN",
  "BLUE",
  "INDIGO",
  "VIOLET",
  "ULTRAVIOLET",
] as const;

function secureMatch(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, maxLength);
}

function integer(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function bounded(value: unknown, fallback: number, min = 0, max = 999) {
  return Math.max(min, Math.min(max, integer(value, fallback)));
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
    return NextResponse.json({ error: "Invalid roster request." }, { status: 400 });
  }

  const action = cleanText(body.action, 40);
  const room = cleanText(body.room, 96);
  if (!room) return NextResponse.json({ error: "Room is required." }, { status: 400 });

  const supabase = createFriendComputerSupabase();

  if (action === "list") {
    const { data, error } = await supabase.rpc("fc_get_roster", {
      p_room: room,
      p_gm_key: providedKey,
    });
    if (error) {
      console.error("Friend Computer roster read failed", error.message);
      return NextResponse.json({ error: "Unable to load citizen directory." }, { status: 502 });
    }
    return NextResponse.json({ citizens: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  }

  if (action === "upsert") {
    const citizen = body.citizen && typeof body.citizen === "object" ? (body.citizen as Record<string, unknown>) : {};
    const seat = integer(citizen.seat);
    const citizenId = cleanText(citizen.citizenId, 64);
    const displayName = cleanText(citizen.displayName, 80);
    const clearance = cleanText(citizen.clearance, 24).toUpperCase();
    const cloneNumber = integer(citizen.cloneNumber, 1);
    const email = cleanText(citizen.email, 254);
    const serviceGroup = cleanText(citizen.serviceGroup, 80);
    const firm = cleanText(citizen.firm, 100);
    const mbd = cleanText(citizen.mbd, 100);
    const perversityPoints = bounded(citizen.perversityPoints, 25);
    const officialCommendations = bounded(citizen.officialCommendations, 0);
    const officialReprimands = bounded(citizen.officialReprimands, 0);

    if (seat < 1 || seat > 4 || !citizenId || !displayName || !CLEARANCES.includes(clearance as (typeof CLEARANCES)[number])) {
      return NextResponse.json({ error: "Citizen record is incomplete or invalid." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("fc_upsert_citizen", {
      p_room: room,
      p_gm_key: providedKey,
      p_seat: seat,
      p_citizen_id: citizenId,
      p_display_name: displayName,
      p_clearance: clearance,
      p_clone_number: Math.max(1, Math.min(99, cloneNumber)),
      p_email: email || null,
      p_service_group: serviceGroup,
      p_firm: firm,
      p_mbd: mbd,
      p_perversity_points: perversityPoints,
      p_official_commendations: officialCommendations,
      p_official_reprimands: officialReprimands,
    });
    if (error || data !== true) {
      console.error("Friend Computer roster write failed", error?.message ?? "rpc rejected");
      return NextResponse.json({ error: "Unable to save citizen record." }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "adjust_xp_status") {
    const seat = integer(body.seat);
    const perversityDelta = Math.max(-99, Math.min(99, integer(body.perversityDelta)));
    const commendationDelta = Math.max(-99, Math.min(99, integer(body.commendationDelta)));
    const reprimandDelta = Math.max(-99, Math.min(99, integer(body.reprimandDelta)));
    const { data, error } = await supabase.rpc("fc_adjust_xp_status", {
      p_room: room,
      p_gm_key: providedKey,
      p_seat: seat,
      p_perversity_delta: perversityDelta,
      p_commendation_delta: commendationDelta,
      p_reprimand_delta: reprimandDelta,
    });
    if (error || data !== true) {
      return NextResponse.json({ error: "Unable to update XP citizen status." }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  }

  // Compatibility for a controller loaded before the XP terminology correction.
  if (action === "adjust_points") {
    const seat = integer(body.seat);
    const commendationDelta = Math.max(-99, Math.min(99, integer(body.commendationDelta)));
    const reprimandDelta = Math.max(-99, Math.min(99, integer(body.treasonDelta)));
    const { data, error } = await supabase.rpc("fc_adjust_xp_status", {
      p_room: room,
      p_gm_key: providedKey,
      p_seat: seat,
      p_perversity_delta: 0,
      p_commendation_delta: commendationDelta,
      p_reprimand_delta: reprimandDelta,
    });
    if (error || data !== true) {
      return NextResponse.json({ error: "Unable to update citizen status." }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "recent_notices") {
    const { data, error } = await supabase.rpc("fc_recent_notices", {
      p_room: room,
      p_gm_key: providedKey,
      p_limit: 20,
    });
    if (error) {
      console.error("Friend Computer notice history failed", error.message);
      return NextResponse.json({ error: "Unable to load notice history." }, { status: 502 });
    }
    return NextResponse.json({ notices: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ error: "Unknown roster action." }, { status: 400 });
}
