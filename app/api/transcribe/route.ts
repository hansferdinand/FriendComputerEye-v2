import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe";
const MAX_ATTEMPTS = 30;
const WINDOW_MS = 60_000;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

const attempts = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function rateLimited(ip: string) {
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || current.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_ATTEMPTS;
}

function secureMatch(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, maxLength);
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many listening requests. Try again shortly." }, { status: 429 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const gmKey = process.env.FRIEND_COMPUTER_GM_KEY;
  if (!apiKey || !gmKey) {
    return NextResponse.json({ error: "Friend Computer listening is not configured on this deployment." }, { status: 503 });
  }

  const providedKey = request.headers.get("x-friend-computer-gm-key") ?? "";
  if (!secureMatch(providedKey, gmKey)) {
    return NextResponse.json({ error: "GM authorization rejected." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid audio upload." }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "No recorded audio was received." }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "That recording is too large. Keep push-to-listen clips under 45 seconds." }, { status: 413 });
  }

  const contentType = audio.type.toLowerCase();
  if (contentType && !contentType.startsWith("audio/")) {
    return NextResponse.json({ error: "Unsupported recording format." }, { status: 415 });
  }

  const playerNames = cleanText(form.get("playerNames"), 220);
  const safetyId = createHash("sha256").update(`friend-computer:${gmKey}`).digest("hex");

  const upstreamForm = new FormData();
  upstreamForm.set("model", MODEL);
  upstreamForm.set("response_format", "json");
  upstreamForm.set("file", audio, audio.name || "friend-computer-listen.webm");
  if (playerNames) {
    upstreamForm.set(
      "prompt",
      `Alpha Complex tabletop roleplaying session. Likely terms include Friend Computer, Troubleshooter, treason, clone, security clearance, and these citizen names: ${playerNames}.`,
    );
  }

  try {
    const upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Safety-Identifier": safetyId,
      },
      body: upstreamForm,
      cache: "no-store",
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      console.error("OpenAI transcription request failed", upstream.status, errorText.slice(0, 500));
      return NextResponse.json({ error: `OpenAI transcription request failed (${upstream.status}).` }, { status: 502 });
    }

    const data = (await upstream.json()) as { text?: unknown };
    const text = cleanText(data.text, 1200);
    if (!text) {
      return NextResponse.json({ error: "Friend Computer could not make out that recording." }, { status: 422 });
    }

    return NextResponse.json(
      { text, model: MODEL },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("Friend Computer transcription failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Unable to reach OpenAI transcription." }, { status: 502 });
  }
}
