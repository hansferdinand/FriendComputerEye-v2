"use client";

import {
  parseMissionPackageFile,
  type SceneMissionPackageFile,
} from "@/lib/mission-package-format";

export const IMPORTED_MISSIONS_STORAGE_KEY = "friend-computer-imported-missions:v1";
export const MISSION_WORKSHOP_DRAFT_PREFIX = "friend-computer-mission-workshop:v1";

export function missionWorkshopDraftKey(room: string) {
  return `${MISSION_WORKSHOP_DRAFT_PREFIX}:${room.trim().toLowerCase() || "alpha"}`;
}

export function loadImportedMissions() {
  const raw = window.localStorage.getItem(IMPORTED_MISSIONS_STORAGE_KEY);
  const parsed = raw ? JSON.parse(raw) as unknown : [];
  if (!Array.isArray(parsed)) throw new Error("Saved custom missions are not in the expected format.");
  return parsed.map(parseMissionPackageFile);
}

export function storeImportedMissions(missions: SceneMissionPackageFile[]) {
  window.localStorage.setItem(IMPORTED_MISSIONS_STORAGE_KEY, JSON.stringify(missions));
}

export function downloadMissionFile(mission: SceneMissionPackageFile) {
  const payload = {
    $schema: "./friend-computer-mission.schema.json",
    ...mission,
  };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${mission.id}.mission.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
