import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createFriendComputerSupabase } from "@/lib/fc-supabase-server";
import { parseMissionPackageFile } from "@/lib/mission-package-format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secureMatch(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function roomFrom(request: NextRequest) {
  return (request.nextUrl.searchParams.get("room") ?? "").trim().toLowerCase().slice(0, 96);
}

function authorization(request: NextRequest) {
  const configured = process.env.FRIEND_COMPUTER_GM_KEY;
  const provided = request.headers.get("x-friend-computer-gm-key") ?? "";
  return configured && secureMatch(provided, configured) ? { configured, provided } : null;
}

export async function GET(request: NextRequest) {
  const auth = authorization(request);
  if (!auth) return NextResponse.json({ error: "GM authorization rejected." }, { status: 401 });
  const room = roomFrom(request);
  if (!room) return NextResponse.json({ error: "Room code is required." }, { status: 400 });

  const supabase = createFriendComputerSupabase();
  const { data, error } = await supabase.rpc("fc_list_mission_author_drafts", {
    p_room: room,
    p_gm_key: auth.provided,
    p_include_imported: false,
  });
  if (error) {
    console.error("Mission draft inbox list failed", error.message);
    return NextResponse.json({ error: "Mission draft inbox is unavailable." }, { status: 502 });
  }

  const drafts = Array.isArray(data) ? data.flatMap((row) => {
    try {
      const item = row as Record<string, unknown>;
      return [{
        id: String(item.id),
        missionId: String(item.mission_id),
        title: String(item.title),
        createdBy: String(item.created_by),
        createdAt: String(item.created_at),
        mission: parseMissionPackageFile(item.mission),
      }];
    } catch {
      return [];
    }
  }) : [];

  return NextResponse.json({ drafts }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function PATCH(request: NextRequest) {
  const auth = authorization(request);
  if (!auth) return NextResponse.json({ error: "GM authorization rejected." }, { status: 401 });
  const room = roomFrom(request);
  if (!room) return NextResponse.json({ error: "Room code is required." }, { status: 400 });

  let body: { draftId?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid draft request." }, { status: 400 });
  }
  const draftId = typeof body.draftId === "string" ? body.draftId : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draftId)) {
    return NextResponse.json({ error: "Valid draft ID is required." }, { status: 400 });
  }

  const supabase = createFriendComputerSupabase();
  const { data, error } = await supabase.rpc("fc_mark_mission_author_draft_imported", {
    p_room: room,
    p_gm_key: auth.provided,
    p_draft_id: draftId,
  });
  if (error || data !== true) {
    console.error("Mission draft inbox update failed", error?.message ?? "draft not found");
    return NextResponse.json({ error: "Draft could not be marked as imported." }, { status: 502 });
  }

  return NextResponse.json({ imported: true }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
