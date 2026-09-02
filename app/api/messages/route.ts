import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createFriendComputerSupabase } from "@/lib/fc-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonObject = Record<string, unknown>;
type RateBucket = { count: number; resetAt: number };

const rateBuckets = new Map<string, RateBucket>();
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
};

function secureMatch(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\0/g, "").trim().slice(0, maxLength);
}

function integer(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function actorDigest(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function withinRateLimit(request: NextRequest, actor: string, isSend: boolean) {
  const now = Date.now();
  if (rateBuckets.size > 2_000) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (bucket.resetAt <= now) rateBuckets.delete(bucketKey);
    }
  }
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = `${forwarded}:${actorDigest(actor)}:${isSend ? "send" : "read"}`;
  const limit = isSend ? 20 : 120;
  const existing = rateBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  existing.count += 1;
  return existing.count <= limit;
}

function json(payload: JsonObject, status = 200) {
  return NextResponse.json(payload, { status, headers: NO_STORE_HEADERS });
}

async function readJson(request: NextRequest) {
  try {
    return (await request.json()) as JsonObject;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid messaging request." }, 400);

  const action = cleanText(body.action, 48);
  const isGmAction = action.startsWith("gm_");
  const isPlayerAction = action.startsWith("player_");
  if (!isGmAction && !isPlayerAction) return json({ error: "Unknown messaging action." }, 400);

  const gmKey = request.headers.get("x-friend-computer-gm-key") ?? "";
  const participantToken = request.headers.get("x-friend-computer-participant-token") ?? "";
  const actorCredential = isGmAction ? gmKey : participantToken;
  if (!actorCredential) return json({ error: "Messaging authorization is required." }, 401);
  if (!withinRateLimit(request, actorCredential, action.endsWith("send"))) {
    return json({ error: "Too many messaging requests. Wait one minute and try again." }, 429);
  }

  const supabase = createFriendComputerSupabase();

  if (isGmAction) {
    const configuredGmKey = process.env.FRIEND_COMPUTER_GM_KEY;
    if (!configuredGmKey) return json({ error: "Friend Computer GM authorization is not configured." }, 503);
    if (!secureMatch(gmKey, configuredGmKey)) return json({ error: "GM authorization rejected." }, 401);

    const room = cleanText(body.room, 96);
    if (!room) return json({ error: "Room is required." }, 400);

    const { data: sessionAccepted, error: sessionError } = await supabase.rpc("fc_ensure_session", {
      p_room: room,
      p_gm_key: gmKey,
    });
    if (sessionError) return json({ error: "Unable to authorize this Alpha Complex room." }, 502);
    if (sessionAccepted !== true) {
      return json({ error: "This room is bound to a different GM passphrase." }, 409);
    }

    if (action === "gm_bootstrap") {
      const [settingsResult, invitesResult, messagesResult] = await Promise.all([
        supabase.rpc("fc_message_gm_settings", { p_room: room, p_gm_key: gmKey }),
        supabase.rpc("fc_message_gm_invites", { p_room: room, p_gm_key: gmKey }),
        supabase.rpc("fc_message_gm_list", { p_room: room, p_gm_key: gmKey, p_limit: 100 }),
      ]);
      const firstError = settingsResult.error ?? invitesResult.error ?? messagesResult.error;
      if (firstError) {
        console.error("Friend Computer messaging bootstrap failed", firstError.message);
        return json({ error: "Private messaging is not available yet. Apply the pending database migration first." }, 503);
      }
      return json({
        settings: settingsResult.data?.[0] ?? null,
        invites: invitesResult.data ?? [],
        messages: messagesResult.data ?? [],
      });
    }

    if (action === "gm_update_settings") {
      const retentionHours = integer(body.retentionHours, 168);
      const { data, error } = await supabase.rpc("fc_message_gm_update_settings", {
        p_room: room,
        p_gm_key: gmKey,
        p_allow_player_to_player: body.allowPlayerToPlayer === true,
        p_retention_hours: retentionHours,
      });
      if (error || data !== true) return json({ error: "Unable to save messaging settings." }, 502);
      return json({ ok: true });
    }

    if (action === "gm_issue_invite") {
      const seat = integer(body.seat);
      if (seat < 1 || seat > 16) return json({ error: "Citizen seat is invalid." }, 400);
      const token = randomBytes(32).toString("base64url");
      const { data, error } = await supabase.rpc("fc_message_gm_issue_token", {
        p_room: room,
        p_gm_key: gmKey,
        p_seat: seat,
        p_token: token,
      });
      if (error || data !== true) return json({ error: "Unable to create a player inbox link." }, 502);
      return json({
        ok: true,
        inviteUrl: `${request.nextUrl.origin}/inbox/${encodeURIComponent(token)}`,
        expiresInDays: 30,
      });
    }

    if (action === "gm_revoke_invite") {
      const seat = integer(body.seat);
      const { data, error } = await supabase.rpc("fc_message_gm_revoke_token", {
        p_room: room,
        p_gm_key: gmKey,
        p_seat: seat,
      });
      if (error || data !== true) return json({ error: "Unable to revoke that inbox link." }, 502);
      return json({ ok: true });
    }

    if (action === "gm_send") {
      const recipientSeat = integer(body.recipientSeat);
      const message = cleanText(body.message, 2000);
      if (!message) return json({ error: "Message text is required." }, 400);
      const { data, error } = await supabase.rpc("fc_message_gm_send", {
        p_room: room,
        p_gm_key: gmKey,
        p_recipient_seat: recipientSeat,
        p_body: message,
      });
      if (error || !data) return json({ error: "Unable to send that private message." }, 502);
      return json({ ok: true, messageId: data });
    }

    if (action === "gm_mark_read") {
      const senderSeat = body.senderSeat == null ? null : integer(body.senderSeat);
      const { data, error } = await supabase.rpc("fc_message_gm_mark_read", {
        p_room: room,
        p_gm_key: gmKey,
        p_sender_seat: senderSeat,
      });
      if (error) return json({ error: "Unable to update message status." }, 502);
      return json({ ok: true, changed: data ?? 0 });
    }

    if (action === "gm_delete_all") {
      const { data, error } = await supabase.rpc("fc_message_gm_delete_all", {
        p_room: room,
        p_gm_key: gmKey,
      });
      if (error) return json({ error: "Unable to clear room messages." }, 502);
      return json({ ok: true, deleted: data ?? 0 });
    }
  }

  if (isPlayerAction) {
    const identityResult = await supabase.rpc("fc_message_player_identity", { p_token: participantToken });
    if (identityResult.error) {
      console.error("Friend Computer player messaging authorization failed", identityResult.error.message);
      return json({ error: "Private messaging is not available yet." }, 503);
    }
    const identity = identityResult.data?.[0];
    if (!identity) return json({ error: "This inbox link is invalid, expired, or revoked." }, 401);

    if (action === "player_bootstrap") {
      const [directoryResult, messagesResult] = await Promise.all([
        supabase.rpc("fc_message_player_directory", { p_token: participantToken }),
        supabase.rpc("fc_message_player_list", { p_token: participantToken, p_limit: 100 }),
      ]);
      const firstError = directoryResult.error ?? messagesResult.error;
      if (firstError) return json({ error: "Unable to load this citizen inbox." }, 502);
      return json({
        identity,
        directory: directoryResult.data ?? [],
        messages: messagesResult.data ?? [],
      });
    }

    if (action === "player_send") {
      const recipientKind = body.recipientKind === "citizen" ? "citizen" : "gm";
      const recipientSeat = recipientKind === "citizen" ? integer(body.recipientSeat) : null;
      const message = cleanText(body.message, 2000);
      if (!message) return json({ error: "Message text is required." }, 400);
      if (recipientKind === "citizen" && identity.allow_player_to_player !== true) {
        return json({ error: "Direct Citizen-to-Citizen messaging is disabled for this room." }, 403);
      }
      const { data, error } = await supabase.rpc("fc_message_player_send", {
        p_token: participantToken,
        p_recipient_kind: recipientKind,
        p_recipient_seat: recipientSeat,
        p_body: message,
      });
      if (error || !data) return json({ error: "Unable to send that private message." }, 502);
      return json({ ok: true, messageId: data });
    }

    if (action === "player_mark_read") {
      const senderKind = body.senderKind === "citizen" ? "citizen" : "gm";
      const senderSeat = senderKind === "citizen" ? integer(body.senderSeat) : null;
      const { data, error } = await supabase.rpc("fc_message_player_mark_read", {
        p_token: participantToken,
        p_sender_kind: senderKind,
        p_sender_seat: senderSeat,
      });
      if (error) return json({ error: "Unable to update message status." }, 502);
      return json({ ok: true, changed: data ?? 0 });
    }
  }

  return json({ error: "Unknown messaging action." }, 400);
}
