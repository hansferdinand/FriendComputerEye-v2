import {
  BUILT_IN_MISSION_PACKAGES,
  parseMissionPackageFile,
  type DirectorMissionPackage,
} from "@/lib/mission-package-format";
import type { Expression, ThreatLevel } from "@/lib/friend-computer";
import type { RehearsalSessionState } from "@/lib/rehearsal";

export const GM_HANDOFF_FORMAT = "friend-computer-gm-handoff" as const;
export const GM_HANDOFF_VERSION = 1 as const;
export const GM_HANDOFF_APP_VERSION = "2.0.0-alpha.3" as const;
export const GM_HANDOFF_CONFIG_PREFIX = "friend-computer-gm-handoff-config:v1";
export const CONTROL_PLAYER_NAMES_STORAGE_KEY = "friend-computer-v2:player-names:v1";

export type HandoffRosterEntry = {
  seat: number;
  displayName: string;
};

export type HandoffProjectorPreset = {
  id: string;
  label: string;
  status: string;
  speak: string;
  expression: Expression;
  intensity: number;
  threat: ThreatLevel;
};

export type HandoffSpeechPreset = {
  id: string;
  label: string;
  text: string;
};

export type HandoffHandout = {
  sceneId: string;
  sceneTitle: string;
  name: string;
};

export type HandoffDisplayRecommendation = {
  expectedDisplayCount: number;
  audioPolicy: "one-primary" | "visual-only";
  note: string;
};

export type HandoffRehearsal = {
  missionId: string;
  activeSceneId: string | null;
  testedIds: string[];
  completedSceneIds: string[];
  updatedAt: number;
};

export type GmHandoffPayload = {
  sourceRoom: string;
  mission: DirectorMissionPackage;
  roster: HandoffRosterEntry[];
  presets: {
    projector: HandoffProjectorPreset[];
    speech: HandoffSpeechPreset[];
  };
  display: HandoffDisplayRecommendation;
  handouts: HandoffHandout[];
  rehearsal: HandoffRehearsal | null;
  notes: string[];
};

export type GmHandoffPackage = {
  format: typeof GM_HANDOFF_FORMAT;
  version: typeof GM_HANDOFF_VERSION;
  createdAt: string;
  createdBy: string;
  payload: GmHandoffPayload;
  checksum: {
    algorithm: "SHA-256";
    value: string;
  };
};

export type StoredHandoffConfiguration = {
  version: 1;
  importedAt: number;
  sourceRoom: string;
  missionId: string;
  presets: GmHandoffPayload["presets"];
  display: HandoffDisplayRecommendation;
  handouts: HandoffHandout[];
  notes: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value: unknown, context: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${context} must be a non-empty string.`);
  return value.trim().slice(0, maxLength);
}

function cleanOptionalString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanStringArray(value: unknown, context: string, maxItems: number, maxLength: number) {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`${context} is not a supported list.`);
  return value.map((item, index) => cleanString(item, `${context}[${index}]`, maxLength));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

async function sha256(value: unknown) {
  if (typeof crypto === "undefined" || !crypto.subtle) throw new Error("This browser cannot create or verify SHA-256 handoff checksums.");
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseMission(value: unknown): DirectorMissionPackage {
  if (!isRecord(value) || !isRecord(value.director)) throw new Error("Handoff mission is incomplete.");
  if (value.director.type === "scenes") {
    const parsed = parseMissionPackageFile(value);
    const builtIn = BUILT_IN_MISSION_PACKAGES.find((mission) => mission.id === parsed.id);
    if (builtIn && JSON.stringify(parsed) !== JSON.stringify(builtIn)) throw new Error("A handoff cannot redefine a built-in mission ID.");
    return builtIn ?? parsed;
  }
  if (value.director.type !== "countdown" || value.director.engine !== "satiate-7") throw new Error("Handoff countdown mission is not supported.");
  const matching = BUILT_IN_MISSION_PACKAGES.find((mission) => mission.id === value.id && mission.director.type === "countdown");
  if (!matching) throw new Error("Only the built-in SATIATE-7 countdown mission can be transferred as a countdown package.");
  return matching;
}

function parseRoster(value: unknown) {
  if (!Array.isArray(value) || value.length > 16) throw new Error("Handoff roster must contain no more than 16 seats.");
  const seats = new Set<number>();
  return value.map((item, index): HandoffRosterEntry => {
    if (!isRecord(item)) throw new Error(`payload.roster[${index}] must be an object.`);
    const seat = Number(item.seat);
    if (!Number.isInteger(seat) || seat < 1 || seat > 16 || seats.has(seat)) throw new Error(`payload.roster[${index}].seat is invalid or duplicated.`);
    seats.add(seat);
    return { seat, displayName: cleanString(item.displayName, `payload.roster[${index}].displayName`, 80) };
  }).sort((a, b) => a.seat - b.seat);
}

const EXPRESSIONS = ["neutral", "happy", "suspicious", "angry", "terrified", "drugged"] as const;
const THREATS = ["INFRARED", "RED", "ORANGE", "YELLOW", "GREEN", "BLUE", "INDIGO", "VIOLET", "ULTRAVIOLET"] as const;

function parsePresets(value: unknown): GmHandoffPayload["presets"] {
  if (!isRecord(value) || !Array.isArray(value.projector) || !Array.isArray(value.speech)) throw new Error("Handoff preset manifest is incomplete.");
  if (value.projector.length > 20 || value.speech.length > 100) throw new Error("Handoff preset manifest is too large.");
  const projector = value.projector.map((item, index): HandoffProjectorPreset => {
    if (!isRecord(item)) throw new Error(`payload.presets.projector[${index}] must be an object.`);
    const expression = cleanString(item.expression, `payload.presets.projector[${index}].expression`, 24) as Expression;
    const threat = cleanString(item.threat, `payload.presets.projector[${index}].threat`, 24) as ThreatLevel;
    const intensity = Number(item.intensity);
    if (!EXPRESSIONS.includes(expression) || !THREATS.includes(threat) || !Number.isFinite(intensity) || intensity < 0 || intensity > 1) {
      throw new Error(`payload.presets.projector[${index}] contains an unsupported display value.`);
    }
    return {
      id: cleanString(item.id, `payload.presets.projector[${index}].id`, 64),
      label: cleanString(item.label, `payload.presets.projector[${index}].label`, 100),
      status: cleanString(item.status, `payload.presets.projector[${index}].status`, 200),
      speak: cleanString(item.speak, `payload.presets.projector[${index}].speak`, 1000),
      expression,
      intensity,
      threat,
    };
  });
  const speech = value.speech.map((item, index): HandoffSpeechPreset => {
    if (!isRecord(item)) throw new Error(`payload.presets.speech[${index}] must be an object.`);
    return {
      id: cleanString(item.id, `payload.presets.speech[${index}].id`, 100),
      label: cleanString(item.label, `payload.presets.speech[${index}].label`, 120),
      text: cleanString(item.text, `payload.presets.speech[${index}].text`, 3000),
    };
  });
  return { projector, speech };
}

function parseDisplay(value: unknown): HandoffDisplayRecommendation {
  if (!isRecord(value)) throw new Error("Handoff display recommendation is missing.");
  const expectedDisplayCount = Number(value.expectedDisplayCount);
  if (!Number.isInteger(expectedDisplayCount) || expectedDisplayCount < 1 || expectedDisplayCount > 12) throw new Error("Expected display count must be between 1 and 12.");
  if (value.audioPolicy !== "one-primary" && value.audioPolicy !== "visual-only") throw new Error("Audio policy is not supported.");
  return {
    expectedDisplayCount,
    audioPolicy: value.audioPolicy,
    note: cleanOptionalString(value.note, 500),
  };
}

function parseHandouts(value: unknown) {
  if (!Array.isArray(value) || value.length > 250) throw new Error("Handoff handout manifest is not supported.");
  return value.map((item, index): HandoffHandout => {
    if (!isRecord(item)) throw new Error(`payload.handouts[${index}] must be an object.`);
    return {
      sceneId: cleanString(item.sceneId, `payload.handouts[${index}].sceneId`, 100),
      sceneTitle: cleanString(item.sceneTitle, `payload.handouts[${index}].sceneTitle`, 160),
      name: cleanString(item.name, `payload.handouts[${index}].name`, 300),
    };
  });
}

function parseRehearsal(value: unknown): HandoffRehearsal | null {
  if (value === null) return null;
  if (!isRecord(value)) throw new Error("Handoff rehearsal record is invalid.");
  const updatedAt = Number(value.updatedAt);
  if (!Number.isFinite(updatedAt) || updatedAt < 0) throw new Error("Handoff rehearsal timestamp is invalid.");
  return {
    missionId: cleanString(value.missionId, "payload.rehearsal.missionId", 100),
    activeSceneId: value.activeSceneId === null ? null : cleanString(value.activeSceneId, "payload.rehearsal.activeSceneId", 100),
    testedIds: cleanStringArray(value.testedIds, "payload.rehearsal.testedIds", 500, 160),
    completedSceneIds: cleanStringArray(value.completedSceneIds, "payload.rehearsal.completedSceneIds", 100, 100),
    updatedAt,
  };
}

function parsePayload(value: unknown): GmHandoffPayload {
  if (!isRecord(value)) throw new Error("Handoff payload must be an object.");
  return {
    sourceRoom: cleanString(value.sourceRoom, "payload.sourceRoom", 96),
    mission: parseMission(value.mission),
    roster: parseRoster(value.roster),
    presets: parsePresets(value.presets),
    display: parseDisplay(value.display),
    handouts: parseHandouts(value.handouts),
    rehearsal: parseRehearsal(value.rehearsal),
    notes: cleanStringArray(value.notes, "payload.notes", 40, 1000),
  };
}

export async function createGmHandoffPackage(payload: GmHandoffPayload): Promise<GmHandoffPackage> {
  const normalized = parsePayload(payload);
  return {
    format: GM_HANDOFF_FORMAT,
    version: GM_HANDOFF_VERSION,
    createdAt: new Date().toISOString(),
    createdBy: GM_HANDOFF_APP_VERSION,
    payload: normalized,
    checksum: { algorithm: "SHA-256", value: await sha256(normalized) },
  };
}

export async function parseGmHandoffPackage(value: unknown): Promise<GmHandoffPackage> {
  if (!isRecord(value)) throw new Error("Handoff package must contain a JSON object.");
  if (value.format !== GM_HANDOFF_FORMAT) throw new Error(`format must be "${GM_HANDOFF_FORMAT}".`);
  if (value.version !== GM_HANDOFF_VERSION) throw new Error(`Only GM handoff version ${GM_HANDOFF_VERSION} is supported.`);
  if (!isRecord(value.checksum) || value.checksum.algorithm !== "SHA-256" || typeof value.checksum.value !== "string" || !/^[a-f0-9]{64}$/i.test(value.checksum.value)) {
    throw new Error("Handoff checksum is missing or invalid.");
  }
  const expected = await sha256(value.payload);
  if (expected !== value.checksum.value.toLowerCase()) throw new Error("Handoff checksum does not match. The package may be incomplete or modified.");
  const createdAt = cleanString(value.createdAt, "createdAt", 64);
  if (Number.isNaN(Date.parse(createdAt))) throw new Error("Handoff creation timestamp is invalid.");
  return {
    format: GM_HANDOFF_FORMAT,
    version: GM_HANDOFF_VERSION,
    createdAt,
    createdBy: cleanString(value.createdBy, "createdBy", 64),
    payload: parsePayload(value.payload),
    checksum: { algorithm: "SHA-256", value: expected },
  };
}

export async function parseGmHandoffPackageText(text: string) {
  try {
    return await parseGmHandoffPackage(JSON.parse(text) as unknown);
  } catch (reason) {
    if (reason instanceof SyntaxError) throw new Error("Handoff package is not valid JSON.");
    throw reason;
  }
}

export function handoffConfigurationKey(room: string) {
  const normalized = room.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-") || "alpha";
  return `${GM_HANDOFF_CONFIG_PREFIX}:${normalized}`;
}

export function readStoredHandoffConfiguration(room: string): StoredHandoffConfiguration | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(handoffConfigurationKey(room));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredHandoffConfiguration>;
    if (value.version !== 1 || !value.presets || !value.display || !Array.isArray(value.handouts) || !Array.isArray(value.notes)) return null;
    return value as StoredHandoffConfiguration;
  } catch {
    return null;
  }
}

export function toRehearsalSession(rehearsal: HandoffRehearsal): RehearsalSessionState {
  return {
    version: 1,
    active: false,
    missionId: rehearsal.missionId,
    activeSceneId: rehearsal.activeSceneId,
    testedIds: rehearsal.testedIds,
    completedSceneIds: rehearsal.completedSceneIds,
    updatedAt: Date.now(),
  };
}

export function downloadGmHandoffPackage(bundle: GmHandoffPackage) {
  const blob = new Blob([`${JSON.stringify(bundle, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${bundle.payload.mission.id}.gm-handoff.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
