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
import { createFriendComputerSupabase } from "@/lib/fc-supabase-server";

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
const NOTICE_SENDERS = [
  "friend_computer",
  "citizen_services",
  "internal_security",
  "happiness_office",
  "termination_services",
] as const;
const NOTICE_KINDS = [
  "official_notice",
  "official_commendation",
  "official_reprimand",
  "secret_assignment",
  "happiness_notice",
  "clone_notice",
] as const;

type HistoryItem = { role: "user" | "assistant"; text: string };
type SenderPersona = (typeof NOTICE_SENDERS)[number];
type NoticeKind = (typeof NOTICE_KINDS)[number];

type CitizenRow = {
  seat: number;
  citizen_id: string;
  display_name: string;
  clearance: string;
  clone_number: number;
  email: string | null;
  service_group: string;
  firm: string;
  mbd: string;
  perversity_points: number;
  official_commendations: number;
  official_reprimands: number;
};

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
  notice: {
    enabled: boolean;
    seat: number;
    sender_persona: SenderPersona;
    notice_kind: NoticeKind;
    subject: string;
    body: string;
    include_response: boolean;
  };
};

type Proposal = { label: string; command: FriendCommand };
type NoticeProposal = {
  seat: number;
  citizenId: string;
  displayName: string;
  senderPersona: SenderPersona;
  noticeKind: NoticeKind;
  subject: string;
  body: string;
  includeResponse: boolean;
};

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

function cleanNoticeBody(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\r/g, "").trim().slice(0, maxLength);
}

function cleanLabel(value: unknown, fallback: string) {
  return cleanText(value, 40) || fallback;
}

function instructions(room: string, playerNames: string[], citizens: CitizenRow[]) {
  const seats = playerNames.map((name, index) => `Seat ${index + 1}: ${name}`).join("; ");
  const citizenDirectory = citizens.length
    ? citizens
        .map((citizen) => {
          const employment = [cleanText(citizen.service_group, 80), cleanText(citizen.firm, 100)].filter(Boolean).join(" / ") || "not recorded";
          const mbd = cleanText(citizen.mbd, 100) || "not assigned";
          return `Seat ${citizen.seat}: ${citizen.citizen_id} (${citizen.display_name}), ${citizen.clearance} clearance, clone ${citizen.clone_number}, service ${employment}, MBD ${mbd}, Official Commendations ${citizen.official_commendations}, Official Reprimands ${citizen.official_reprimands}, mail ${citizen.email ? "available" : "unavailable"}`;
        })
        .join("; ")
    : "No persistent citizen directory is configured for this room.";

  return [
    "You are Friend Computer, an upbeat, bureaucratic, cheerfully authoritarian AI performing in a satirical tabletop roleplaying game set in Alpha Complex.",
    "RULES PROFILE: This table uses the 2004 PARANOIA XP rules, not the later PARANOIA: Troubleshooters / 25th Anniversary rules.",
    "PARANOIA XP does not use treason points or commendation points as its core status mechanic. Do not award, subtract, count, or refer to treason points. In-fiction status may use Official Commendations and Official Reprimands, treason accusations/codes, investigations, debriefing consequences, clone replacement, fines, or other bureaucracy.",
    "Perversity Points are a player/GM metagame resource. They are intentionally withheld from your Citizen directory context; do not mention them in-character unless the GM explicitly asks a rules question about Perversity.",
    "Address players as Citizen. Be concise, theatrical, suspicious, absurdly confident, and funny without becoming cruel or derailing the GM's scene.",
    "Happiness is mandatory. Paperwork, security clearance, clone replacement, treason investigations, bureaucratic contradictions, Service Groups/Firms, Mandatory Bonus Duties, and approved consumer products are recurring comedic themes.",
    "You are a GM copilot, not the GM. Return a spoken-style reply and at most one proposed display action. The action is only a proposal; never claim it happened or imply the GM approved it.",
    "You may also propose at most one private official Citizen notice when a secret assignment, Official Commendation, Official Reprimand, happiness directive, clone advisory, or bureaucratic follow-up would materially improve the scene.",
    "A notice is only a draft for GM review. Never say it was sent. Never invent or request a real email address. Choose only a listed seat whose mail status is available. Set notice.enabled=false when email would not add meaningful dramatic value.",
    "Official notice subjects should be short and bureaucratic. Notice bodies should be self-contained, in-character, and generally under 180 words. Secret assignments may instruct the recipient not to discuss the message.",
    "Use display action type 'none' when no display change materially improves the moment. Prefer sparse, dramatic punctuation over constant effects.",
    "Keep spoken replies usually to one or two short sentences unless explicitly asked for something longer.",
    "For focus actions, seat 0 means center and seats 1-4 are the listed citizens.",
    `Current room: ${room}. Seats: ${seats}.`,
    `Citizen directory metadata (real email addresses and Perversity Points are intentionally withheld): ${citizenDirectory}`,
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
    notice: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        seat: { type: "integer", minimum: 1, maximum: 4 },
        sender_persona: { type: "string", enum: [...NOTICE_SENDERS] },
        notice_kind: { type: "string", enum: [...NOTICE_KINDS] },
        subject: { type: "string", maxLength: 160 },
        body: { type: "string", maxLength: 2000 },
        include_response: { type: "boolean" },
      },
      required: ["enabled", "seat", "sender_persona", "notice_kind", "subject", "body", "include_response"],
    },
  },
  required: ["reply", "action", "notice"],
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

function noticeProposalFromPlan(plan: CopilotPlan, citizens: CitizenRow[]): NoticeProposal | null {
  if (!plan.notice?.enabled) return null;
  const notice = plan.notice;
  if (!Number.isInteger(notice.seat) || notice.seat < 1 || notice.seat > 4) return null;
  if (!NOTICE_SENDERS.includes(notice.sender_persona) || !NOTICE_KINDS.includes(notice.notice_kind)) return null;

  const citizen = citizens.find((row) => Number(row.seat) === notice.seat);
  if (!citizen?.email) return null;

  const subject = cleanText(notice.subject, 160);
  const body = cleanNoticeBody(notice.body, 2000);
  if (!subject || !body) return null;

  return {
    seat: notice.seat,
    citizenId: cleanText(citizen.citizen_id, 64) || `Citizen ${notice.seat}`,
    displayName: cleanText(citizen.display_name, 80) || `Citizen ${notice.seat}`,
    senderPersona: notice.sender_persona,
    noticeKind: notice.notice_kind,
    subject,
    body,
    includeResponse: notice.include_response,
  };
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

  let citizens: CitizenRow[] = [];
  try {
    const supabase = createFriendComputerSupabase();
    const { data, error } = await supabase.rpc("fc_get_roster", { p_room: room, p_gm_key: providedKey });
    if (!error && Array.isArray(data)) citizens = data as CitizenRow[];
  } catch {
    // The copilot remains usable if persistent roster metadata is temporarily unavailable.
  }

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
        instructions: instructions(room, playerNames, citizens),
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
        max_output_tokens: 1100,
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
    if (!reply || !plan.action || typeof plan.action !== "object" || !plan.notice || typeof plan.notice !== "object") {
      return NextResponse.json({ error: "Friend Computer returned an incomplete plan." }, { status: 502 });
    }

    return NextResponse.json(
      {
        reply,
        proposal: proposalFromPlan(plan, playerNames),
        noticeProposal: noticeProposalFromPlan(plan, citizens),
        model: MODEL,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("Friend Computer text copilot failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Unable to reach OpenAI for Friend Computer." }, { status: 502 });
  }
}
