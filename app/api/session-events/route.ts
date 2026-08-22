import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createFriendComputerSupabase } from "@/lib/fc-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = ["GENERAL", "MISSION", "DISCOVERY", "ACCUSATION", "CLONE", "NPC", "EQUIPMENT", "SECRET_ORDER", "DEBRIEF"] as const;
const VISIBILITIES = ["COMPUTER", "GM_ONLY"] as const;
const IMPORTANCES = ["MINOR", "NORMAL", "IMPORTANT"] as const;

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

function integer(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

export async function POST(request: NextRequest) {
  const gmKey = process.env.FRIEND_COMPUTER_GM_KEY;
  if (!gmKey) return NextResponse.json({ error: "Friend Computer GM authorization is not configured." }, { status: 503 });

  const providedKey = request.headers.get("x-friend-computer-gm-key") ?? "";
  if (!secureMatch(providedKey, gmKey)) return NextResponse.json({ error: "GM authorization rejected." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid session event request." }, { status: 400 });
  }

  const room = cleanSingleLine(body.room, 96);
  const action = cleanSingleLine(body.action, 24);
  if (!room) return NextResponse.json({ error: "Room is required." }, { status: 400 });

  const supabase = createFriendComputerSupabase();

  if (action === "list") {
    const limit = Math.max(1, Math.min(100, integer(body.limit, 60)));
    const { data, error } = await supabase.rpc("fc_list_session_events", {
      p_room: room,
      p_gm_key: providedKey,
      p_limit: limit,
    });
    if (error) {
      console.error("Session event read failed", error.message);
      return NextResponse.json({ error: "Unable to load session event log." }, { status: 502 });
    }
    return NextResponse.json({ events: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  }

  if (action === "add") {
    const category = cleanSingleLine(body.category, 24).toUpperCase();
    const visibility = cleanSingleLine(body.visibility, 16).toUpperCase();
    const importance = cleanSingleLine(body.importance, 16).toUpperCase();
    const seatValue = body.seat === null || body.seat === undefined || body.seat === "" ? null : integer(body.seat);
    const title = cleanSingleLine(body.title, 160);
    const detail = cleanBlock(body.detail, 1200);
    const occurredAtRaw = cleanSingleLine(body.occurredAt, 64);
    const occurredAt = occurredAtRaw && !Number.isNaN(Date.parse(occurredAtRaw)) ? new Date(occurredAtRaw).toISOString() : new Date().toISOString();

    if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) return NextResponse.json({ error: "Invalid event category." }, { status: 400 });
    if (!VISIBILITIES.includes(visibility as (typeof VISIBILITIES)[number])) return NextResponse.json({ error: "Invalid event visibility." }, { status: 400 });
    if (!IMPORTANCES.includes(importance as (typeof IMPORTANCES)[number])) return NextResponse.json({ error: "Invalid event importance." }, { status: 400 });
    if (seatValue !== null && (seatValue < 1 || seatValue > 4)) return NextResponse.json({ error: "Invalid citizen seat." }, { status: 400 });
    if (!title) return NextResponse.json({ error: "Event title is required." }, { status: 400 });

    const { data, error } = await supabase.rpc("fc_add_session_event", {
      p_room: room,
      p_gm_key: providedKey,
      p_category: category,
      p_visibility: visibility,
      p_importance: importance,
      p_seat: seatValue,
      p_title: title,
      p_detail: detail,
      p_occurred_at: occurredAt,
    });
    if (error || data === null) {
      console.error("Session event write failed", error?.message ?? "rpc rejected");
      return NextResponse.json({ error: "Unable to record session event." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, id: data });
  }

  if (action === "delete") {
    const id = integer(body.id);
    if (id < 1) return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
    const { data, error } = await supabase.rpc("fc_delete_session_event", {
      p_room: room,
      p_gm_key: providedKey,
      p_id: id,
    });
    if (error || data !== true) return NextResponse.json({ error: "Unable to delete session event." }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown session event action." }, { status: 400 });
}
