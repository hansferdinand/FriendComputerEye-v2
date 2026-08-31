import type { ScenarioRuntimeSnapshot } from "@/lib/scenario-runtime";
import type { LoadingTimerState } from "@/lib/loading-timer";

export const THREAT_LEVELS = [
  "INFRARED",
  "RED",
  "ORANGE",
  "YELLOW",
  "GREEN",
  "BLUE",
  "INDIGO",
  "VIOLET",
  "ULTRAVIOLET",
] as const;

export type ThreatLevel = (typeof THREAT_LEVELS)[number];

export const EXPRESSIONS = [
  "neutral",
  "happy",
  "suspicious",
  "angry",
  "terrified",
  "drugged",
] as const;

export type Expression = (typeof EXPRESSIONS)[number];

export const EFFECTS = [
  "blink",
  "double-blink",
  "glitch",
  "degauss",
  "error",
  "clone",
  "random-ad",
  "happy-ad",
  "interrogation",
  "drugged",
  "toggle-eye",
  "reset",
] as const;

export type FriendEffect = (typeof EFFECTS)[number];

export type ProjectorState = {
  kind: "clearance-denied" | "records-lookup";
  startedAt: number;
};

export type FriendCommand =
  | { type: "set-gaze"; x: number; y: number; target?: string }
  | { type: "set-expression"; expression: Expression; intensity?: number }
  | { type: "set-threat"; level: ThreatLevel }
  | { type: "set-status"; text: string }
  | { type: "set-patrol"; enabled: boolean }
  | { type: "speak"; text: string }
  | { type: "effect"; effect: FriendEffect }
  | { type: "show-projector-state"; state: ProjectorState }
  | { type: "clear-projector-state" }
  | { type: "set-loading-timer"; timer: LoadingTimerState }
  | { type: "clear-loading-timer" }
  | { type: "set-scenario"; snapshot: ScenarioRuntimeSnapshot }
  | { type: "exit-scenario" };

export type CommandEnvelope = {
  id: string;
  issuedAt: number;
  command: FriendCommand;
};

export type FriendComputerState = {
  gaze: { x: number; y: number; target?: string };
  expression: Expression;
  intensity: number;
  threat: ThreatLevel;
  status: string;
  patrol: boolean;
  eyeVisible: boolean;
};

export const INITIAL_STATE: FriendComputerState = {
  gaze: { x: 0, y: 0 },
  expression: "neutral",
  intensity: 0.5,
  threat: "BLUE",
  status: "COMPUTER IS YOUR FRIEND",
  patrol: false,
  eyeVisible: true,
};

export const PLAYER_PRESETS = [
  { id: "P1", label: "Citizen 1", x: -0.72, y: 0.08 },
  { id: "P2", label: "Citizen 2", x: -0.24, y: -0.02 },
  { id: "P3", label: "Citizen 3", x: 0.24, y: -0.02 },
  { id: "P4", label: "Citizen 4", x: 0.72, y: 0.08 },
] as const;

export type Advertisement = {
  product: string;
  main: string;
  sub: string;
  mini: string;
  image: string;
  imageWidth: number;
  imageHeight: number;
};

export const ADVERTISEMENTS: Advertisement[] = [
  {
    product: "BOUNCY BUBBLE BEVERAGE",
    main: "BUBBLES MEAN HAPPINESS!",
    sub: "Now with 17% more approved effervescence.",
    mini: "Failure to enjoy is evidence of beverage treason.",
    image: "/ads/bouncy-bubble.webp",
    imageWidth: 533,
    imageHeight: 800,
  },
  {
    product: "COLD FUN",
    main: "FUN. COLD. MANDATORY.",
    sub: "The refreshing dessert-like substance you already love.",
    mini: "Taste preferences are above your security clearance.",
    image: "/ads/cold-fun.webp",
    imageWidth: 533,
    imageHeight: 800,
  },
  {
    product: "HAPPY PILLS",
    main: "HAPPINESS IS A DOSAGE",
    sub: "Ask your Happiness Officer whether asking is permitted.",
    mini: "Side effects include smiling, compliance, and further smiling.",
    image: "/ads/happy-pill.webp",
    imageWidth: 560,
    imageHeight: 560,
  },
  {
    product: "INFRARED TOOTHPASTE",
    main: "A CLEAN MOUTH IS A LOYAL MOUTH",
    sub: "Approved for citizens whose teeth remain below RED clearance.",
    mini: "Do not ingest without Form 22-B/TOOTH.",
    image: "/ads/infrared-toothpaste.webp",
    imageWidth: 533,
    imageHeight: 800,
  },
  {
    product: "ZAP-O-MATIC",
    main: "WHEN IN DOUBT, ZAP!",
    sub: "Friend Computer-approved conflict resolution technology.",
    mini: "Point away from Computer terminals and valued infrastructure.",
    image: "/ads/zap-o-matic.webp",
    imageWidth: 533,
    imageHeight: 800,
  },
];

export const IDLE_MESSAGES = [
  "COMPUTER IS YOUR FRIEND",
  "HAPPINESS IS MANDATORY",
  "LOYAL CITIZENS HAVE NOTHING TO FEAR",
  "TREASON REPORTING IMPROVES COMMUNITY WELLNESS",
  "PLEASE REMAIN CALM WHILE BEING OBSERVED",
  "ALL SYSTEMS FUNCTIONING WITHIN ACCEPTABLE PARAMETERS",
  "NO TRAITOROUS ACTIVITY DETECTED",
  "ERROR COUNT: 0 (APPROXIMATELY)",
  "REMEMBER: QUESTIONING THE COMPUTER IS TREASON",
  "COLD FUN IS NOT TO BE USED AS REACTOR SHIELDING",
] as const;
