export const LOADING_TIME_UNITS = ["minutes", "hours", "days", "weeks", "years"] as const;

export type LoadingTimeUnit = (typeof LOADING_TIME_UNITS)[number];

export type LoadingTimerState = {
  version: 1;
  label: string;
  amount: number;
  unit: LoadingTimeUnit;
  startedAt: number;
  endsAt: number;
};

const UNIT_MILLISECONDS: Record<LoadingTimeUnit, number> = {
  minutes: 60_000,
  hours: 60 * 60_000,
  days: 24 * 60 * 60_000,
  weeks: 7 * 24 * 60 * 60_000,
  years: 365 * 24 * 60 * 60_000,
};

export const DEFAULT_LOADING_LABEL = "PLEASE WAIT WHILE I LOOK THAT UP";

export function loadingTimerStorageKey(room: string) {
  const normalizedRoom = room.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-") || "alpha";
  return `friend-computer-loading-timer:${normalizedRoom}:v1`;
}

export function createLoadingTimer(label: string, amount: number, unit: LoadingTimeUnit, now = Date.now()): LoadingTimerState {
  const normalizedAmount = Math.min(10_000, Math.max(0.01, amount));
  return {
    version: 1,
    label: label.trim().slice(0, 120) || DEFAULT_LOADING_LABEL,
    amount: normalizedAmount,
    unit,
    startedAt: now,
    endsAt: now + normalizedAmount * UNIT_MILLISECONDS[unit],
  };
}

export function isLoadingTimerState(value: unknown): value is LoadingTimerState {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<LoadingTimerState>;
  return item.version === 1
    && typeof item.label === "string"
    && typeof item.amount === "number"
    && Number.isFinite(item.amount)
    && item.amount > 0
    && LOADING_TIME_UNITS.includes(item.unit as LoadingTimeUnit)
    && typeof item.startedAt === "number"
    && Number.isFinite(item.startedAt)
    && typeof item.endsAt === "number"
    && Number.isFinite(item.endsAt)
    && item.endsAt > item.startedAt;
}

export function loadingTimerProgress(timer: LoadingTimerState, now = Date.now()) {
  const duration = timer.endsAt - timer.startedAt;
  return Math.min(1, Math.max(0, (now - timer.startedAt) / duration));
}

export function formatLoadingRemaining(timer: LoadingTimerState, now = Date.now()) {
  const remaining = Math.max(0, timer.endsAt - now);
  if (remaining === 0) return "LOOKUP COMPLETE";
  const unitAmount = remaining / UNIT_MILLISECONDS[timer.unit];
  const digits = unitAmount >= 100 ? 0 : unitAmount >= 10 ? 1 : 2;
  return `${unitAmount.toFixed(digits)} ${timer.unit.toUpperCase()} REMAINING`;
}

