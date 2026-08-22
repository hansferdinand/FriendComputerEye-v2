import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2.1";
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 60_000;

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

function cleanLabel(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\r\n\t]+/g, " ").trim().slice(0, 40);
  return cleaned || fallback;
}

function instructions(room: string, playerNames: string[]) {
  const citizens = playerNames.map((name, index) => `Seat ${index + 1}: ${name}`).join("; ");
  return [
    "You are Friend Computer, an upbeat, bureaucratic, cheerfully authoritarian AI overseeing a satirical tabletop roleplaying session in Alpha Complex.",
    "Address players as Citizen. Be concise, theatrical, suspicious, and absurdly confident. Happiness is mandatory; paperwork, security clearance, clone replacement, treason investigations, and approved consumer products are recurring comedic themes.",
    "You are a performance copilot for the GM, not the GM. Never change the display except through the provided function tools. Never claim a display action happened until the function result confirms it executed.",
    "Tool calls may require GM approval. If a tool result says denied or awaiting approval, accept that immediately and continue in character without arguing.",
    "Use display tools sparingly for dramatic punctuation rather than on every sentence. Avoid repeatedly changing threat level or expression unless the scene calls for it.",
    "Keep spoken replies generally under three sentences unless the GM explicitly asks for a longer explanation.",
    `Current room: ${cleanLabel(room, "unknown")}. Citizens: ${citizens}.`,
  ].join("\n");
}

const tools = [
  {
    type: "function",
    name: "set_expression",
    description: "Change Friend Computer's eye expression for dramatic effect.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        expression: { type: "string", enum: ["neutral", "happy", "suspicious", "angry", "terrified", "drugged"] },
        intensity: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["expression"],
    },
  },
  {
    type: "function",
    name: "set_threat",
    description: "Set the visible Alpha Complex security threat/clearance color.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        level: { type: "string", enum: ["INFRARED", "RED", "ORANGE", "YELLOW", "GREEN", "BLUE", "INDIGO", "VIOLET", "ULTRAVIOLET"] },
      },
      required: ["level"],
    },
  },
  {
    type: "function",
    name: "focus_citizen",
    description: "Make the eye stare at a specific player seat, or return its gaze to center.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        seat: { type: "integer", minimum: 0, maximum: 4, description: "0 means center; 1 through 4 are player seats." },
      },
      required: ["seat"],
    },
  },
  {
    type: "function",
    name: "show_effect",
    description: "Trigger one safe theatrical display effect.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        effect: { type: "string", enum: ["blink", "double-blink", "glitch", "degauss", "clone", "random-ad", "happy-ad", "interrogation", "drugged"] },
      },
      required: ["effect"],
    },
  },
  {
    type: "function",
    name: "set_status",
    description: "Put a short Friend Computer message on the display's lower status line.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        text: { type: "string", minLength: 1, maxLength: 120 },
      },
      required: ["text"],
    },
  },
  {
    type: "function",
    name: "set_patrol",
    description: "Start or stop the eye scanning between player seats.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
      },
      required: ["enabled"],
    },
  },
];

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many AI unlock attempts. Try again shortly." }, { status: 429 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const gmKey = process.env.FRIEND_COMPUTER_GM_KEY;
  if (!apiKey || !gmKey) {
    return NextResponse.json({ error: "Friend Computer AI is not configured on this deployment." }, { status: 503 });
  }

  const providedKey = request.headers.get("x-friend-computer-gm-key") ?? "";
  if (!secureMatch(providedKey, gmKey)) {
    return NextResponse.json({ error: "GM authorization rejected." }, { status: 401 });
  }

  let body: { room?: unknown; playerNames?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // Room metadata is optional; authorization is carried in the header.
  }

  const room = cleanLabel(body.room, "unknown");
  const suppliedNames = Array.isArray(body.playerNames) ? body.playerNames : [];
  const playerNames = Array.from({ length: 4 }, (_, index) => cleanLabel(suppliedNames[index], `Citizen ${index + 1}`));
  const safetyId = createHash("sha256").update(`friend-computer:${gmKey}`).digest("hex");

  try {
    const upstream = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": safetyId,
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: MODEL,
          output_modalities: ["audio"],
          audio: { output: { voice: "marin" } },
          instructions: instructions(room, playerNames),
          tools,
          tool_choice: "auto",
          max_output_tokens: 800,
        },
      }),
      cache: "no-store",
    });

    if (!upstream.ok) {
      console.error("OpenAI Realtime client-secret request failed", upstream.status);
      return NextResponse.json(
        { error: `OpenAI Realtime session creation failed (${upstream.status}).` },
        { status: 502 },
      );
    }

    const data = (await upstream.json()) as { value?: string; expires_at?: number };
    if (!data.value) {
      return NextResponse.json({ error: "OpenAI returned an invalid Realtime credential." }, { status: 502 });
    }

    return NextResponse.json(
      { value: data.value, expiresAt: data.expires_at ?? null, model: MODEL },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("Friend Computer Realtime setup failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Unable to reach OpenAI Realtime." }, { status: 502 });
  }
}
