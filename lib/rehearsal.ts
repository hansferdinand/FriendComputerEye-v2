"use client";

export const REHEARSAL_STORAGE_PREFIX = "friend-computer-rehearsal:v1";
export const REHEARSAL_STATE_EVENT = "friend-computer-rehearsal-state";

export type RehearsalSessionState = {
  version: 1;
  active: boolean;
  missionId: string;
  activeSceneId: string | null;
  testedIds: string[];
  completedSceneIds: string[];
  updatedAt: number;
};

export function rehearsalStorageKey(room: string) {
  const normalizedRoom = room.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-") || "alpha";
  return `${REHEARSAL_STORAGE_PREFIX}:${normalizedRoom}`;
}

export function readRehearsalSession(room: string): RehearsalSessionState | null {
  const raw = window.localStorage.getItem(rehearsalStorageKey(room));
  if (!raw) return null;
  const value = JSON.parse(raw) as Partial<RehearsalSessionState>;
  if (value.version !== 1 || typeof value.active !== "boolean" || typeof value.missionId !== "string") return null;
  return {
    version: 1,
    active: value.active,
    missionId: value.missionId,
    activeSceneId: typeof value.activeSceneId === "string" ? value.activeSceneId : null,
    testedIds: Array.isArray(value.testedIds) ? value.testedIds.filter((item): item is string => typeof item === "string") : [],
    completedSceneIds: Array.isArray(value.completedSceneIds) ? value.completedSceneIds.filter((item): item is string => typeof item === "string") : [],
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : Date.now(),
  };
}

export function writeRehearsalSession(room: string, state: RehearsalSessionState) {
  window.localStorage.setItem(rehearsalStorageKey(room), JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(REHEARSAL_STATE_EVENT, { detail: { room, state } }));
}
