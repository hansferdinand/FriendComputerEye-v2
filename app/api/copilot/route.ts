import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  EXPRESSIONS,
  PLAYER_PRESETS,
  THREAT_LEVELS,
  type Expression,
  type FriendCommand,
  type FriendEffect,
  type ThreatLevel,
} from "@/lib/friend-computer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.OPENAI_COPILOT_MODEL ?? "gpt-5.6-terra";
const MAX_ATTEMPTS = 30;
const WINDOW_MS = 60_000;
const SAFE_EFFECTS = [
  "blink",
  "double-blink",
  "glitch",
  "degauss",
  "clone",
  "random-ad",
  "happy-ad",
  "interrogation",
  "drugged",
] as const satisfies readonly FriendEffect[];

type HistoryItem = { role: "user" | "assistant"; text: string };

type CopilotPlan = {
  reply: string;
  action: {
    type: "none" | "expression" | "threat" | "focus" | "effect" | "status" | "patrol";
    expression: Expression;
    intensity: number;
    level: ThreatLevel;
    seat: number;
    effect: (typeof SAFE_EFFECTS)[number];
    text: string;
    enabled: boolean;
  };
};

type Proposal = { label: string; command: FriendCommand };

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

function cleanLabel(value: unknown, fallback: string) {
  return cleanText(value, 40) || fallback;
}

function instructions(room: string, playerNames: string[]) {
  const citizens = playerNames.map((name, index) => `Seat ${index + 1}: ${name}`).join("; ");
  return [
    "You are Friend Computer, an upbeat, bureaucratic, cheerfully authoritarian AI performing in a satirical tabletop roleplaying game set in Alpha Complex.",
    "Address players as Citizen. Be concise, theatrical, suspicious, absurdly confident, and funny without becoming cruel or derailing the GM's scene.",
    "Happiness is mandatory. Paperwork, security clearance, clone replacement, treason investigations, bureaucratic contradictions, and approved consumer products are recurring comedic themes.",
    "You are a GM copilot, not the GM. Return a spoken-style reply and at most one proposed display action. The action is only a proposal; never claim it happened or imply the GM approved it.",
    "Use action type 'none' when no display change materially improves the moment. Prefer sparse, dramatic punctuation over constant effects.",
    "Keep replies usually to one or two short sentences unless explicitly asked for something longer.",
    "For focus actions, seat 0 means center and seats 1-4 are the listed citizens.",
    `Current room: ${room}. Citizens: ${citizens}.`,
  ].join("\n");
}

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    reply: { type: "string", minLength: 1, maxLength: 700 },
    action: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string", enum: ["none", "expression", "threat", "focus", "effect", "status", "patrol"] },
        expression: { type: "string", enum: [...EXPRESSIONS] },
        intensity: { type: "number", minimum: 0, maximum: 1 },
        level: { type: "string", enum: [...THREAT_LEVELS] },
        seat: { type: "integer", minimum: 0, maximum: 4 },
        effect: { type: "string", enum: [...SAFE_EFFECTS] },
        text: { type: "string", maxLength: 120 },
        enabled: { type: "boolean" },
      },
      required: ["type", "expression", "intensity", "level", "seat", "effect", "text", "enabled"],
    },
  },
  required: ["reply", "action"],
} as const;

function extractOutputText(data: Record<string, unknown>) {
  if (typeof data.output_text === "string") return data.output_text;
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown }).content) ? (item as { content: unknown[] }).content : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") return text;
    }
  }
  return "";
}

function proposalFromPlan(plan: CopilotPlan, playerNames: string[]): Proposal | null {
  const action = plan.action;
  switch (action.type) {
    case "none":
      return null;
    case "expression": {
      if (!EXPRESSIONS.includes(action.expression)) return null;
      const intensity = Math.max(0, Math.min(1, action.intensity));
      return {
        label: `Expression → ${action.expression.toUpperCase()} (${Math.round(intensity * 100)}%)`,
        command: { type: "set-expression", expression: action.expression, intensity },
      };
    }
    case "threat":
      if (!THREAT_LEVELS.includes(action.level)) return null;
      return { label: `Threat → ${action.level}`, command: { type: "set-threat", level: action.level } };
    case "focus": {
      if (!Number.isInteger(action.seat) || action.seat < 0 || action.seat > 4) return null;
      if (action.seat === 0) return { label: "Gaze → CENTER", command: { type: "set-gaze", x: 0, y: 0, target: "CENTER" } };
      const preset = PLAYER_PRESETS[action.seat - 1];
      const target = playerNames[action.seat - 1] || preset.label;
      return { label: `Watch → ${target}`, command: { type: "set-gaze", x: preset.x, y: preset.y, target } };
    }
    case "effect":
      if (!SAFE_EFFECTS.includes(action.effect)) return null;
      return { label: `Effect → ${action.effect.toUpperCase()}`, command: { type: "effect", effect: action.effect } };
    case "status": {
      const text = cleanText(action.text, 120);
      if (!text) return null;
      return { label: `Status → “${text}”`, command: { type: "set-status", text } };
    }
    case "patrol":
      return { label: action.enabled ? "Begin citizen patrol" : "Stop citizen patrol", command: { type: "set-patrol", enabled: action.enabled } };
    default:
      return null;
  }
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (rateLimited(ip)) return NextResponse.json({ error: "Too many copilot requests. Try again shortly." }, { status: 429 });

  const apiKey = process.env.OPENAI_API_KEY;
  const gmKey = process.env.FRIEND_COMPUTER_GM_KEY;
  if (!apiKey || !gmKey) return NextResponse.json({ error: "Friend Computer AI is not configured on this deployment." }, { status: 503 });

  const providedKey = request.headers.get("x-friend-computer-gm-key") ?? "";
  if (!secureMatch(providedKey, gmKey)) return NextResponse.json({ error: "GM authorization rejected." }, { status: 401 });

  let body: { room?: unknown; prompt?: unknown; playerNames?: unknown; history?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid copilot request." }, { status: 400 });
  }

  const prompt = cleanText(body.prompt, 1200);
  if (!prompt) return NextResponse.json({ error: "Enter something for Friend Computer to respond to." }, { status: 400 });

  const room = cleanLabel(body.room, "unknown");
  const suppliedNames = Array.isArray(body.playerNames) ? body.playerNames : [];
  const playerNames = Array.from({ length: 4 }, (_, index) => cleanLabel(suppliedNames[index], `Citizen ${index + 1}`));
  const suppliedHistory = Array.isArray(body.history) ? body.history.slice(-8) : [];
  const history: HistoryItem[] = suppliedHistory.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const role = (item as { role?: unknown }).role;
    const text = cleanText((item as { text?: unknown }).text, 700);
    if ((role !== "user" && role !== "assistant") || !text) return [];
    return [{ role, text } as HistoryItem];
  });

  const recent = history.length
    ? `Recent exchange:\n${history.map((item) => `${item.role === "user" ? "USER" : "FRIEND COMPUTER"}: ${item.text}`).join("\n")}\n\n`
    : "";
  const input = `${recent}CURRENT INPUT: ${prompt}`;
  const safetyId = createHash("sha256").update(`friend-computer:${gmKey}`).digest("hex");

  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": safetyId,
      },
      body: JSON.stringify({
        model: MODEL,
        instructions: instructions(room, playerNames),
        input,
        reasoning: { effort: "low" },
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "friend_computer_copilot",
            strict: true,
            schema: responseSchema,
          },
        },
        max_output_tokens: 700,
        store: false,
        safety_identifier: safetyId,
      }),
      cache: "no-store",
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      console.error("OpenAI Responses request failed", upstream.status, errorText.slice(0, 500));
      return NextResponse.json({ error: `OpenAI copilot request failed (${upstream.status}).` }, { status: 502 });
    }

    const data = (await upstream.json()) as Record<string, unknown>;
    const outputText = extractOutputText(data);
    if (!outputText) return NextResponse.json({ error: "OpenAI returned no copilot response." }, { status: 502 });

    let plan: CopilotPlan;
    try {
      plan = JSON.parse(outputText) as CopilotPlan;
    } catch {
      console.error("OpenAI copilot structured output was not valid JSON");
      return NextResponse.json({ error: "Friend Computer returned an unreadable plan." }, { status: 502 });
    }

    const reply = cleanText(plan.reply, 700);
    if (!reply || !plan.action || typeof plan.action !== "object") {
      return NextResponse.json({ error: "Friend Computer returned an incomplete plan." }, { status: 502 });
    }

    return NextResponse.json(
      { reply, proposal: proposalFromPlan(plan, playerNames), model: MODEL },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("Friend Computer text copilot failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Unable to reach OpenAI for Friend Computer." }, { status: 502 });
  }
}
