export const SATIATE_SCENARIO_ID = "90-minutes-to-treason" as const;

export type ScenarioPresentationKind =
  | "normal"
  | "announcement"
  | "analysis"
  | "alert"
  | "warning";

export type SatiateOutcome = "normal-lunch" | "cafeteria-malfunction" | "weaponized-lunch" | "device-destroyed";
export type SatiateSubsystemState = "NORMAL" | "DAMAGED" | "MODIFIED" | "DISABLED";
export type SatiateSubsystem = "TARGETING" | "GUIDANCE" | "PRESSURE" | "THERMAL SYSTEM" | "SERVING ARMS" | "POWER";

export type ScenarioPresentation = {
  kind: ScenarioPresentationKind;
  eyebrow: string;
  headline: string;
  detail: string;
};

export type ScenarioRuntimeSnapshot = {
  version: 1;
  scenarioId: typeof SATIATE_SCENARIO_ID;
  revision: number;
  displayEnabled: boolean;
  remainingMs: number;
  running: boolean;
  endsAt: number | null;
  finalSequenceEnabled: boolean;
  zeroTriggeredAt: number | null;
  outcome: SatiateOutcome;
  presentation: ScenarioPresentation;
  subsystems: Record<SatiateSubsystem, SatiateSubsystemState>;
};

export function scenarioRemainingMs(snapshot: ScenarioRuntimeSnapshot, now = Date.now()) {
  if (!snapshot.running || snapshot.endsAt === null) return Math.max(0, snapshot.remainingMs);
  return Math.max(0, snapshot.endsAt - now);
}

export function formatScenarioTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export function parseScenarioTime(value: string) {
  const parts = value.trim().split(":").map((part) => Number(part));
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) return null;
  const [hours, minutes, seconds] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
  if (seconds > 59 || (parts.length === 3 && minutes > 59)) return null;
  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}
