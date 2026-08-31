import {
  EFFECTS,
  EXPRESSIONS,
  THREAT_LEVELS,
  type FriendCommand,
} from "@/lib/friend-computer";
import {
  PARANOIA_XP_ONE_SHOT,
  type MissionCue,
  type MissionPackage,
  type MissionScene,
} from "@/lib/mission-package";
import { SATIATE_SCENARIO } from "@/lib/scenarios";

export const MISSION_FILE_FORMAT = "friend-computer-mission" as const;
export const MISSION_FILE_VERSION = 1 as const;

type MissionMetadata = Omit<MissionPackage, "scenes"> & {
  format: typeof MISSION_FILE_FORMAT;
  version: typeof MISSION_FILE_VERSION;
};

export type SceneMissionPackageFile = MissionMetadata & {
  director: {
    type: "scenes";
    scenes: MissionScene[];
  };
};

export type CountdownMissionPackage = MissionMetadata & {
  director: {
    type: "countdown";
    engine: "satiate-7";
  };
};

export type DirectorMissionPackage = SceneMissionPackageFile | CountdownMissionPackage;

export const BUILT_IN_MISSION_PACKAGES: DirectorMissionPackage[] = [
  {
    format: MISSION_FILE_FORMAT,
    version: MISSION_FILE_VERSION,
    id: PARANOIA_XP_ONE_SHOT.id,
    title: PARANOIA_XP_ONE_SHOT.title,
    subtitle: PARANOIA_XP_ONE_SHOT.subtitle,
    premise: PARANOIA_XP_ONE_SHOT.premise,
    publicContext: PARANOIA_XP_ONE_SHOT.publicContext,
    gmGuidance: PARANOIA_XP_ONE_SHOT.gmGuidance,
    director: { type: "scenes", scenes: PARANOIA_XP_ONE_SHOT.scenes },
  },
  {
    format: MISSION_FILE_FORMAT,
    version: MISSION_FILE_VERSION,
    id: SATIATE_SCENARIO.id,
    title: SATIATE_SCENARIO.title,
    subtitle: SATIATE_SCENARIO.subtitle,
    premise: SATIATE_SCENARIO.premise,
    publicContext: SATIATE_SCENARIO.publicContext,
    gmGuidance: SATIATE_SCENARIO.gmGuidance,
    director: { type: "countdown", engine: "satiate-7" },
  },
];

const LOG_CATEGORIES = ["MISSION", "DISCOVERY", "ACCUSATION", "CLONE", "NPC", "EQUIPMENT", "SECRET_ORDER", "DEBRIEF", "GENERAL"] as const;
const LOG_VISIBILITIES = ["COMPUTER", "GM_ONLY"] as const;
const LOG_IMPORTANCES = ["MINOR", "NORMAL", "IMPORTANT"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string, context: string) {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${context}.${key} must be a non-empty string.`);
  return value.trim();
}

function optionalString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function oneOf<T extends string>(value: unknown, choices: readonly T[], context: string): T {
  if (typeof value !== "string" || !choices.includes(value as T)) throw new Error(`${context} is not a supported value.`);
  return value as T;
}

function parseCommand(value: unknown, context: string): FriendCommand {
  if (!isRecord(value)) throw new Error(`${context} must be a command object.`);
  const type = requiredString(value, "type", context);
  switch (type) {
    case "set-gaze": {
      const x = value.x;
      const y = value.y;
      if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) throw new Error(`${context} requires numeric x and y values.`);
      return { type, x, y, target: optionalString(value, "target") };
    }
    case "set-expression": {
      const intensity = value.intensity;
      if (intensity !== undefined && (typeof intensity !== "number" || !Number.isFinite(intensity))) throw new Error(`${context}.intensity must be numeric.`);
      return { type, expression: oneOf(value.expression, EXPRESSIONS, `${context}.expression`), intensity };
    }
    case "set-threat":
      return { type, level: oneOf(value.level, THREAT_LEVELS, `${context}.level`) };
    case "set-status":
    case "speak":
      return { type, text: requiredString(value, "text", context) };
    case "set-patrol":
      if (typeof value.enabled !== "boolean") throw new Error(`${context}.enabled must be true or false.`);
      return { type, enabled: value.enabled };
    case "effect":
      return { type, effect: oneOf(value.effect, EFFECTS, `${context}.effect`) };
    default:
      throw new Error(`${context}.type "${type}" is not allowed in a portable mission file.`);
  }
}

function parseCue(value: unknown, context: string): MissionCue {
  if (!isRecord(value)) throw new Error(`${context} must be an object.`);
  if (!Array.isArray(value.commands) || value.commands.length === 0) throw new Error(`${context}.commands must contain at least one command.`);
  let log: MissionCue["log"];
  if (value.log !== undefined) {
    if (!isRecord(value.log)) throw new Error(`${context}.log must be an object.`);
    log = {
      category: oneOf(value.log.category, LOG_CATEGORIES, `${context}.log.category`),
      visibility: oneOf(value.log.visibility, LOG_VISIBILITIES, `${context}.log.visibility`),
      importance: oneOf(value.log.importance, LOG_IMPORTANCES, `${context}.log.importance`),
      title: requiredString(value.log, "title", `${context}.log`),
      detail: requiredString(value.log, "detail", `${context}.log`),
    };
  }
  return {
    id: requiredString(value, "id", context),
    label: requiredString(value, "label", context),
    note: optionalString(value, "note"),
    commands: value.commands.map((command, index) => parseCommand(command, `${context}.commands[${index}]`)),
    log,
  };
}

function parseScene(value: unknown, index: number): MissionScene {
  const context = `director.scenes[${index}]`;
  if (!isRecord(value)) throw new Error(`${context} must be an object.`);
  if (!Array.isArray(value.handouts) || value.handouts.some((item) => typeof item !== "string")) throw new Error(`${context}.handouts must be an array of strings.`);
  if (!Array.isArray(value.cues)) throw new Error(`${context}.cues must be an array.`);
  return {
    id: requiredString(value, "id", context),
    number: requiredString(value, "number", context),
    title: requiredString(value, "title", context),
    location: requiredString(value, "location", context),
    scene: requiredString(value, "scene", context),
    objective: requiredString(value, "objective", context),
    publicContext: requiredString(value, "publicContext", context),
    gmGuidance: requiredString(value, "gmGuidance", context),
    handouts: value.handouts.map((item) => String(item)),
    logVisibility: oneOf(value.logVisibility, LOG_VISIBILITIES, `${context}.logVisibility`),
    cues: value.cues.map((cue, cueIndex) => parseCue(cue, `${context}.cues[${cueIndex}]`)),
  };
}

export function parseMissionPackageFile(value: unknown): SceneMissionPackageFile {
  if (!isRecord(value)) throw new Error("Mission file must contain a JSON object.");
  if (value.format !== MISSION_FILE_FORMAT) throw new Error(`format must be "${MISSION_FILE_FORMAT}".`);
  if (value.version !== MISSION_FILE_VERSION) throw new Error(`Only mission file version ${MISSION_FILE_VERSION} is supported.`);
  if (!isRecord(value.director) || value.director.type !== "scenes") throw new Error('Portable mission files currently require director.type "scenes".');
  if (!Array.isArray(value.director.scenes) || value.director.scenes.length === 0) throw new Error("director.scenes must contain at least one scene.");
  const id = requiredString(value, "id", "mission");
  if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(id)) throw new Error("mission.id must be 3–64 lowercase letters, numbers, hyphens, or underscores.");
  return {
    format: MISSION_FILE_FORMAT,
    version: MISSION_FILE_VERSION,
    id,
    title: requiredString(value, "title", "mission"),
    subtitle: requiredString(value, "subtitle", "mission"),
    premise: requiredString(value, "premise", "mission"),
    publicContext: requiredString(value, "publicContext", "mission"),
    gmGuidance: requiredString(value, "gmGuidance", "mission"),
    director: {
      type: "scenes",
      scenes: value.director.scenes.map(parseScene),
    },
  };
}

export function parseMissionPackageText(text: string) {
  try {
    return parseMissionPackageFile(JSON.parse(text) as unknown);
  } catch (reason) {
    if (reason instanceof SyntaxError) throw new Error("Mission file is not valid JSON.");
    throw reason;
  }
}
