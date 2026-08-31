import type { Expression, ProjectorState, ThreatLevel } from "@/lib/friend-computer";

export type StandardProjectorPreset = {
  id: ProjectorState["kind"];
  label: string;
  status: string;
  speak: string;
  expression: Expression;
  intensity: number;
  threat: ThreatLevel;
};

export const STANDARD_PROJECTOR_PRESETS: StandardProjectorPreset[] = [
  {
    id: "clearance-denied",
    label: "CLEARANCE LEVEL",
    status: "INFORMATION WITHHELD BY CLEARANCE PROTOCOL",
    speak: "That information isn't available at your clearance level.",
    expression: "suspicious",
    intensity: 0.74,
    threat: "RED",
  },
  {
    id: "records-lookup",
    label: "PLEASE WAIT · RECORDS LOOKUP",
    status: "SEARCHING AUTHORIZED ARCHIVES",
    speak: "Please wait while I look that up.",
    expression: "neutral",
    intensity: 0.52,
    threat: "BLUE",
  },
];
