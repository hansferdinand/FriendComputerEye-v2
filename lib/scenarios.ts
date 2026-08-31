import type { Expression, ThreatLevel } from "@/lib/friend-computer";
import {
  SATIATE_SCENARIO_ID,
  type SatiateOutcome,
  type SatiateSubsystem,
  type ScenarioPresentation,
  type ScenarioRuntimeSnapshot,
} from "@/lib/scenario-runtime";

export const SATIATE_DURATION_MS = 90 * 60 * 1000;

export type ScenarioReminder = {
  id: string;
  atMs: number;
  label: string;
  detail: string;
};

export type ScenarioPreset = {
  id: string;
  label: string;
  presentation: ScenarioPresentation;
  expression: Expression;
  intensity: number;
  threat: ThreatLevel;
  speak?: string;
};

export const SATIATE_REMINDERS: ScenarioReminder[] = [
  { id: "maintenance", atMs: 75 * 60_000, label: "AUTHORIZED MAINTENANCE", detail: "SCRUB-O-1138" },
  { id: "recovery", atMs: 62 * 60_000, label: "R&D RECOVERY TEAM", detail: "Communist infiltration." },
  { id: "archive", atMs: 53 * 60_000, label: "R&D ARCHIVE FRAGMENT AVAILABLE", detail: "Reveal only if useful." },
  { id: "tour", atMs: 47 * 60_000, label: "JUNIOR CITIZEN TOUR", detail: "Optional encounter." },
  { id: "failure", atMs: 40 * 60_000, label: "SAT-7 COMPONENT FAILURE", detail: "Select a subsystem if the table needs pressure." },
  { id: "society", atMs: 35 * 60_000, label: "OPTIONAL SECRET SOCIETY INTERACTION", detail: "Corpore Metal · Humanists · Death Leopard" },
  { id: "facilities", atMs: 30 * 60_000, label: "FACILITIES ARRIVAL", detail: "REN-O-VAT-4" },
  { id: "assault", atMs: 20 * 60_000, label: "COMMUNIST ASSAULT", detail: "Skip if the players have already supplied sufficient chaos." },
  { id: "assessment", atMs: 10 * 60_000, label: "FINAL THREAT ASSESSMENT", detail: "Enable the pre-service sequence only when desired." },
  { id: "no-new", atMs: 5 * 60_000, label: "NO NEW ENCOUNTERS", detail: "Let the countdown dominate the ending." },
];

export const SATIATE_FINAL_STAGES = [
  { atMs: 10 * 60_000, label: "PAYLOAD HEATING" },
  { atMs: 5 * 60_000, label: "PRIMARY PAYLOAD TEMPERATURE ACHIEVED" },
  { atMs: 3 * 60_000, label: "TARGETING ARRAY ACTIVE" },
  { atMs: 2 * 60_000, label: "GUIDANCE LOCK ACQUIRING" },
  { atMs: 60_000, label: "FINAL ARMING SEQUENCE" },
  { atMs: 30_000, label: "SECTOR SATURATION IMMINENT" },
] as const;

export const SATIATE_OUTCOMES: Record<SatiateOutcome, { label: string; headline: string; detail: string }> = {
  "normal-lunch": {
    label: "NORMAL LUNCH",
    headline: "HAPPY MANDATORY MEAL PERIOD, CITIZENS!",
    detail: "FRIEND COMPUTER REMINDS YOU THAT PROPER NUTRITION IS LOYALTY!",
  },
  "cafeteria-malfunction": {
    label: "CAFETERIA MALFUNCTION",
    headline: "MEAL DELIVERY ERROR",
    detail: "PLEASE REMAIN IN YOUR DESIGNATED DINING LOCATION",
  },
  "weaponized-lunch": {
    label: "WEAPONIZED LUNCH",
    headline: "SECTOR SATURATION ACTIVE",
    detail: "TARGETS ACQUIRED",
  },
  "device-destroyed": {
    label: "DEVICE DESTROYED",
    headline: "SAT-7 RESPONSE: NONE",
    detail: "NO AUTHORIZED MEAL-SERVICE TELEMETRY RECEIVED",
  },
};

const normalPresentation: ScenarioPresentation = {
  kind: "normal",
  eyebrow: "SAT-7 COUNTDOWN",
  headline: "UNKNOWN DEVICE STATUS: ACTIVE",
  detail: "R&D LAB 7-GAMMA",
};

export const SATIATE_PRESETS: ScenarioPreset[] = [
  { id: "normal", label: "NORMAL MISSION", presentation: normalPresentation, expression: "neutral", intensity: 0.5, threat: "BLUE" },
  { id: "announcement", label: "FRIEND COMPUTER ANNOUNCEMENT", presentation: { kind: "announcement", eyebrow: "FRIEND COMPUTER ANNOUNCEMENT", headline: "TROUBLESHOOTERS, PROVIDE YOUR CURRENT THREAT ASSESSMENT", detail: "COMPLIANCE IS LOYALTY" }, expression: "neutral", intensity: 0.62, threat: "BLUE", speak: "Troubleshooters, please provide your current threat assessment." },
  { id: "rd-targeting", label: "R&D · TARGETING", presentation: { kind: "analysis", eyebrow: "DR. TEST-Y-TUB-5 — R&D", headline: "TARGET ACQUISITION STANDBY", detail: "GUIDANCE RESPONSE NOMINAL" }, expression: "suspicious", intensity: 0.55, threat: "YELLOW" },
  { id: "rd-payload", label: "R&D · PAYLOAD", presentation: { kind: "analysis", eyebrow: "DR. TEST-Y-TUB-5 — R&D", headline: "PAYLOAD SYSTEM ACTIVE", detail: "PRESSURIZED SALINE SOLUTION · ORGANIC MATERIAL DETECTED" }, expression: "suspicious", intensity: 0.68, threat: "YELLOW" },
  { id: "treason", label: "TREASON ALERT", presentation: { kind: "alert", eyebrow: "INTERNAL SECURITY", headline: "COMMUNIST ACTIVITY DETECTED", detail: "TREASON ALERT · REMAIN AVAILABLE FOR QUESTIONING" }, expression: "angry", intensity: 0.94, threat: "RED" },
  { id: "device", label: "DEVICE WARNING", presentation: { kind: "warning", eyebrow: "SAT-7 STATUS CHANGE", headline: "UNKNOWN DEVICE ACTIVITY", detail: "TARGETING ARRAY ACTIVE" }, expression: "suspicious", intensity: 0.82, threat: "ORANGE" },
];

export const SATIATE_MESSAGE_PRESETS = [
  "Current information is insufficient to conclude that the device is dangerous.",
  "Current information is also insufficient to conclude that the device is safe.",
  "Destruction of valuable Computer property without authorization is treason.",
  "Failure to prevent avoidable harm to Alpha Complex is treason.",
  "Due to suspected Communist mutant sabotage, a duplicate Loyalty Officer assignment has been detected. Both Loyalty Officer assignments remain valid.",
  "Discrepancies between Loyalty Reports may indicate treason.",
  "Interesting.",
  "Your experimental findings have been recorded.",
  "Please provide your final assessment before the countdown reaches zero.",
  "Records indicate that SATIATE-7 became dangerous after Troubleshooter arrival.",
  "Proper nutrition is loyalty.",
] as const;

export const SATIATE_SUBSYSTEMS: SatiateSubsystem[] = ["TARGETING", "GUIDANCE", "PRESSURE", "THERMAL SYSTEM", "SERVING ARMS", "POWER"];

export const SATIATE_SCENARIO = {
  id: SATIATE_SCENARIO_ID,
  title: "90 MINUTES TO TREASON",
  subtitle: "SATIATE-7 · Reusable Paranoia XP one-shot",
  premise: "Seven Troubleshooters investigate an unknown R&D machine. Its ninety-minute countdown is obviously apocalyptic and definitely not counting down to lunch.",
  publicContext: "The Troubleshooters are investigating SAT-7, an unknown device in abandoned R&D Lab 7-Gamma. Neither Friend Computer nor R&D has authoritative records of its purpose. The device began a real-time ninety-minute countdown on arrival.",
  gmGuidance: "SATIATE-7 is Sectorwide Automated Tactical Intake & Alimentary Transfer Equipment, an abandoned cafeteria prototype. Keep encounters modular. Countdown milestones are GM-only reminders, never automatic story events. The final pre-service sequence requires explicit GM authorization. Preserve uncertainty until the meal-period reveal or the GM's chosen variant.",
} as const;

export function createSatiateSnapshot(): ScenarioRuntimeSnapshot {
  return {
    version: 1,
    scenarioId: SATIATE_SCENARIO_ID,
    revision: Date.now(),
    displayEnabled: true,
    remainingMs: SATIATE_DURATION_MS,
    running: false,
    endsAt: null,
    finalSequenceEnabled: false,
    zeroTriggeredAt: null,
    outcome: "normal-lunch",
    presentation: normalPresentation,
    subsystems: Object.fromEntries(SATIATE_SUBSYSTEMS.map((name) => [name, "NORMAL"])) as ScenarioRuntimeSnapshot["subsystems"],
  };
}
