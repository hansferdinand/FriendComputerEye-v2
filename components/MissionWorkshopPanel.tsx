"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EFFECTS,
  EXPRESSIONS,
  THREAT_LEVELS,
  type FriendCommand,
  type FriendEffect,
  type Expression,
  type ThreatLevel,
} from "@/lib/friend-computer";
import {
  BUILT_IN_MISSION_PACKAGES,
  MISSION_FILE_FORMAT,
  MISSION_FILE_VERSION,
  parseMissionPackageFile,
  type SceneMissionPackageFile,
} from "@/lib/mission-package-format";
import {
  downloadMissionFile,
  loadImportedMissions,
  missionWorkshopDraftKey,
  storeImportedMissions,
} from "@/lib/mission-library";
import type { MissionCue, MissionScene } from "@/lib/mission-package";
import { createCommandBus, type CommandBus, type RoomPresence } from "@/lib/transport";
import { useGmSession } from "@/lib/gm-session";

const LOG_CATEGORIES = ["MISSION", "DISCOVERY", "ACCUSATION", "CLONE", "NPC", "EQUIPMENT", "SECRET_ORDER", "DEBRIEF", "GENERAL"] as const;
const LOG_VISIBILITIES = ["COMPUTER", "GM_ONLY"] as const;
const LOG_IMPORTANCES = ["MINOR", "NORMAL", "IMPORTANT"] as const;
const METADATA_FIELDS = ["id", "title", "subtitle", "premise", "publicContext", "gmGuidance"] as const;
const PORTABLE_BUILT_INS = BUILT_IN_MISSION_PACKAGES.filter(
  (mission): mission is SceneMissionPackageFile => mission.director.type === "scenes",
);

type MetadataField = (typeof METADATA_FIELDS)[number];
type CueLog = NonNullable<MissionCue["log"]>;
type RemoteMissionDraft = {
  id: string;
  missionId: string;
  title: string;
  createdBy: string;
  createdAt: string;
  mission: SceneMissionPackageFile;
};

function uniqueId(base: string, existing: Iterable<string>) {
  const ids = new Set(existing);
  const normalized = base.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 58) || "item";
  if (!ids.has(normalized)) return normalized;
  let suffix = 2;
  while (ids.has(`${normalized.slice(0, 58)}-${suffix}`)) suffix += 1;
  return `${normalized.slice(0, 58)}-${suffix}`;
}

function createBlankCue(index: number, existing: Iterable<string> = []): MissionCue {
  return {
    id: uniqueId(`cue-${index + 1}`, existing),
    label: "NEW COMPUTER CUE",
    note: "",
    commands: [{ type: "speak", text: "Citizen, Friend Computer has prepared an announcement." }],
  };
}

function createBlankScene(
  index: number,
  existingSceneIds: Iterable<string> = [],
  existingCueIds: Iterable<string> = [],
): MissionScene {
  return {
    id: uniqueId(`scene-${index + 1}`, existingSceneIds),
    number: String(index + 1).padStart(2, "0"),
    title: "NEW SCENE",
    location: "Alpha Complex",
    scene: "Describe what happens when this scene begins.",
    objective: "Describe what the Troubleshooters are expected to accomplish.",
    publicContext: "Record what Friend Computer may safely know about this scene.",
    gmGuidance: "Record private secrets, pacing guidance, and adjudication notes.",
    handouts: [],
    logVisibility: "COMPUTER",
    cues: [createBlankCue(index, existingCueIds)],
  };
}

function createBlankMission(room: string): SceneMissionPackageFile {
  const roomId = room.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36);
  return {
    format: MISSION_FILE_FORMAT,
    version: MISSION_FILE_VERSION,
    id: `${roomId || "alpha"}-new-mission`,
    title: "NEW ALPHA COMPLEX MISSION",
    subtitle: "Custom Friend Computer mission",
    premise: "Summarize the mission's central problem and why it will be entertaining to run.",
    publicContext: "Record the facts players and Friend Computer may know when the mission begins.",
    gmGuidance: "Record the mission's private secrets, tone, and adjudication guidance.",
    director: { type: "scenes", scenes: [createBlankScene(0)] },
  };
}

function cloneMission(mission: SceneMissionPackageFile) {
  return JSON.parse(JSON.stringify(mission)) as SceneMissionPackageFile;
}

function looksLikeWorkshopDraft(value: unknown): value is SceneMissionPackageFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const director = record.director;
  return record.format === MISSION_FILE_FORMAT
    && record.version === MISSION_FILE_VERSION
    && typeof director === "object"
    && director !== null
    && !Array.isArray(director)
    && (director as Record<string, unknown>).type === "scenes"
    && Array.isArray((director as Record<string, unknown>).scenes);
}

function findCommand<T extends FriendCommand["type"]>(commands: FriendCommand[], type: T) {
  return commands.find((command) => command.type === type) as Extract<FriendCommand, { type: T }> | undefined;
}

function replaceCommand<T extends FriendCommand["type"]>(
  commands: FriendCommand[],
  type: T,
  replacement?: Extract<FriendCommand, { type: T }>,
) {
  const next = commands.filter((command) => command.type !== type);
  if (replacement) next.push(replacement);
  return next;
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function validateDraft(draft: SceneMissionPackageFile) {
  const issues: string[] = [];
  for (const field of METADATA_FIELDS) {
    if (!draft[field].trim()) issues.push(`Mission ${field} must not be empty.`);
  }
  if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(draft.id)) issues.push("Mission ID must be 3–64 lowercase letters, numbers, hyphens, or underscores.");
  if (draft.director.scenes.length === 0) issues.push("The mission needs at least one scene.");

  const sceneIds = new Set<string>();
  const cueIds = new Set<string>();
  draft.director.scenes.forEach((scene, sceneIndex) => {
    const sceneLabel = `Scene ${sceneIndex + 1}`;
    if (!scene.id.trim()) issues.push(`${sceneLabel} needs an ID.`);
    if (sceneIds.has(scene.id)) issues.push(`${sceneLabel} duplicates scene ID "${scene.id}".`);
    sceneIds.add(scene.id);
    for (const field of ["number", "title", "location", "scene", "objective", "publicContext", "gmGuidance"] as const) {
      if (!scene[field].trim()) issues.push(`${sceneLabel} ${field} must not be empty.`);
    }
    scene.cues.forEach((cue, cueIndex) => {
      const cueLabel = `${sceneLabel}, cue ${cueIndex + 1}`;
      if (!cue.id.trim()) issues.push(`${cueLabel} needs an ID.`);
      if (cueIds.has(cue.id)) issues.push(`${cueLabel} duplicates cue ID "${cue.id}".`);
      cueIds.add(cue.id);
      if (!cue.label.trim()) issues.push(`${cueLabel} needs a button label.`);
      if (cue.commands.length === 0) issues.push(`${cueLabel} needs at least one display command.`);
      const expression = findCommand(cue.commands, "set-expression");
      if (expression?.intensity !== undefined && (expression.intensity < 0 || expression.intensity > 1)) issues.push(`${cueLabel} expression intensity must be between 0 and 1.`);
      if (cue.log && (!cue.log.title.trim() || !cue.log.detail.trim())) issues.push(`${cueLabel} log title and detail must not be empty.`);
    });
  });

  if (issues.length === 0) {
    try {
      parseMissionPackageFile(draft);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Mission does not match the portable v1 format.";
      issues.push(message);
    }
  }
  return issues;
}

function editableBuiltInCopy(source: SceneMissionPackageFile, existingIds: string[]) {
  const copy = cloneMission(source);
  copy.id = uniqueId(`${source.id}-custom`, existingIds);
  copy.title = `${source.title} — CUSTOM`;
  return copy;
}

export function MissionWorkshopPanel({ room }: { room: string }) {
  const { gmKey, setGmKey, rememberGmKey, sessionReady, restoredFromSession } = useGmSession();
  const [draft, setDraft] = useState<SceneMissionPackageFile>(() => createBlankMission(room));
  const [importedMissions, setImportedMissions] = useState<SceneMissionPackageFile[]>([]);
  const [remoteDrafts, setRemoteDrafts] = useState<RemoteMissionDraft[]>([]);
  const [inboxBusy, setInboxBusy] = useState(false);
  const [inboxUnlocked, setInboxUnlocked] = useState(false);
  const [sourceId, setSourceId] = useState(PORTABLE_BUILT_INS[0]?.id ?? "");
  const [ready, setReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [validationIssues, setValidationIssues] = useState<string[]>([]);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [transport, setTransport] = useState<CommandBus["transport"]>("connecting");
  const [presence, setPresence] = useState<RoomPresence>({ displays: 0, controls: 0, displayClients: [] });
  const busRef = useRef<CommandBus | null>(null);
  const autoInboxAttemptedRef = useRef(false);

  const sources = useMemo(() => [...PORTABLE_BUILT_INS, ...importedMissions], [importedMissions]);
  const draftSignature = useMemo(() => JSON.stringify(draft), [draft]);
  const dirty = savedSignature === null || savedSignature !== draftSignature;
  const displayOnline = transport === "realtime" && presence.displays > 0;

  useEffect(() => {
    try {
      const imported = loadImportedMissions();
      setImportedMissions(imported);
      const rawDraft = window.localStorage.getItem(missionWorkshopDraftKey(room));
      const parsedDraft = rawDraft ? JSON.parse(rawDraft) as unknown : null;
      if (looksLikeWorkshopDraft(parsedDraft)) {
        setDraft(parsedDraft);
        setStatusMessage("AUTOSAVED WORKSHOP DRAFT RESTORED");
      }
    } catch {
      setStatusMessage("WORKSHOP OPENED · SAVED CUSTOM MISSIONS COULD NOT BE RESTORED");
    }
    setReady(true);
  }, [room]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(missionWorkshopDraftKey(room), JSON.stringify(draft));
      } catch {
        setStatusMessage("DRAFT AUTOSAVE UNAVAILABLE · DOWNLOAD A BACKUP");
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft, ready, room]);

  useEffect(() => {
    const bus = createCommandBus(room, undefined, setTransport, setPresence);
    busRef.current = bus;
    return () => {
      bus.close();
      busRef.current = null;
    };
  }, [room]);

  const loadRemoteDrafts = useCallback(async () => {
    if (!gmKey.trim() || inboxBusy) return;
    setInboxBusy(true);
    try {
      const response = await fetch(`/api/mission-drafts?room=${encodeURIComponent(room)}`, {
        headers: { "x-friend-computer-gm-key": gmKey },
        cache: "no-store",
      });
      const payload = await response.json() as { drafts?: RemoteMissionDraft[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Draft inbox could not be opened.");
      const drafts = Array.isArray(payload.drafts) ? payload.drafts : [];
      setRemoteDrafts(drafts);
      setInboxUnlocked(true);
      rememberGmKey();
      setStatusMessage(drafts.length
        ? `${drafts.length} CHATGPT DRAFT${drafts.length === 1 ? "" : "S"} WAITING IN THE WORKSHOP INBOX`
        : "CHATGPT DRAFT INBOX CHECKED · NOTHING WAITING");
    } catch (reason) {
      setInboxUnlocked(false);
      setStatusMessage(reason instanceof Error ? reason.message.toUpperCase() : "CHATGPT DRAFT INBOX UNAVAILABLE");
    } finally {
      setInboxBusy(false);
    }
  }, [gmKey, inboxBusy, rememberGmKey, room]);

  useEffect(() => {
    if (!sessionReady || !restoredFromSession || !gmKey.trim() || autoInboxAttemptedRef.current) return;
    autoInboxAttemptedRef.current = true;
    void loadRemoteDrafts();
  }, [gmKey, loadRemoteDrafts, restoredFromSession, sessionReady]);

  const setMetadata = useCallback((field: MetadataField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setValidationIssues([]);
  }, []);

  const updateScene = useCallback((sceneIndex: number, patch: Partial<MissionScene>) => {
    setDraft((current) => ({
      ...current,
      director: {
        ...current.director,
        scenes: current.director.scenes.map((scene, index) => index === sceneIndex ? { ...scene, ...patch } : scene),
      },
    }));
    setValidationIssues([]);
  }, []);

  const updateCue = useCallback((sceneIndex: number, cueIndex: number, patch: Partial<MissionCue>) => {
    setDraft((current) => ({
      ...current,
      director: {
        ...current.director,
        scenes: current.director.scenes.map((scene, index) => index === sceneIndex
          ? { ...scene, cues: scene.cues.map((cue, itemIndex) => itemIndex === cueIndex ? { ...cue, ...patch } : cue) }
          : scene),
      },
    }));
    setValidationIssues([]);
  }, []);

  const addScene = useCallback(() => {
    setDraft((current) => {
      const existingSceneIds = current.director.scenes.map((scene) => scene.id);
      const existingCueIds = current.director.scenes.flatMap((scene) => scene.cues.map((cue) => cue.id));
      return {
        ...current,
        director: {
          ...current.director,
          scenes: [
            ...current.director.scenes,
            createBlankScene(current.director.scenes.length, existingSceneIds, existingCueIds),
          ],
        },
      };
    });
    setValidationIssues([]);
  }, []);

  const removeScene = useCallback((sceneIndex: number) => {
    setDraft((current) => {
      if (current.director.scenes.length === 1) return current;
      return { ...current, director: { ...current.director, scenes: current.director.scenes.filter((_, index) => index !== sceneIndex) } };
    });
    setValidationIssues([]);
  }, []);

  const reorderScene = useCallback((sceneIndex: number, direction: -1 | 1) => {
    setDraft((current) => ({ ...current, director: { ...current.director, scenes: moveItem(current.director.scenes, sceneIndex, direction) } }));
  }, []);

  const addCue = useCallback((sceneIndex: number) => {
    setDraft((current) => {
      const allCueIds = current.director.scenes.flatMap((scene) => scene.cues.map((cue) => cue.id));
      return {
        ...current,
        director: {
          ...current.director,
          scenes: current.director.scenes.map((scene, index) => index === sceneIndex
            ? { ...scene, cues: [...scene.cues, createBlankCue(scene.cues.length, allCueIds)] }
            : scene),
        },
      };
    });
    setValidationIssues([]);
  }, []);

  const removeCue = useCallback((sceneIndex: number, cueIndex: number) => {
    setDraft((current) => ({
      ...current,
      director: {
        ...current.director,
        scenes: current.director.scenes.map((scene, index) => index === sceneIndex
          ? { ...scene, cues: scene.cues.filter((_, itemIndex) => itemIndex !== cueIndex) }
          : scene),
      },
    }));
    setValidationIssues([]);
  }, []);

  const reorderCue = useCallback((sceneIndex: number, cueIndex: number, direction: -1 | 1) => {
    setDraft((current) => ({
      ...current,
      director: {
        ...current.director,
        scenes: current.director.scenes.map((scene, index) => index === sceneIndex
          ? { ...scene, cues: moveItem(scene.cues, cueIndex, direction) }
          : scene),
      },
    }));
  }, []);

  const beginNewMission = useCallback(() => {
    if (dirty && !window.confirm("Start a new mission? The current workshop draft will be replaced. Save or download it first if needed.")) return;
    const next = createBlankMission(room);
    setDraft(next);
    setSavedSignature(null);
    setValidationIssues([]);
    setStatusMessage("NEW WORKSHOP DRAFT CREATED");
  }, [dirty, room]);

  const loadSourceMission = useCallback(() => {
    const source = sources.find((mission) => mission.id === sourceId);
    if (!source) return;
    if (dirty && !window.confirm("Load this mission into the workshop? The current workshop draft will be replaced.")) return;
    const isBuiltIn = PORTABLE_BUILT_INS.some((mission) => mission.id === source.id);
    const next = isBuiltIn ? editableBuiltInCopy(source, sources.map((mission) => mission.id)) : cloneMission(source);
    setDraft(next);
    setSavedSignature(isBuiltIn ? null : JSON.stringify(next));
    setValidationIssues([]);
    setStatusMessage(isBuiltIn ? "BUILT-IN MISSION COPIED INTO A NEW CUSTOM DRAFT" : `${next.title} LOADED FOR EDITING`);
  }, [dirty, sourceId, sources]);

  const loadRemoteDraft = useCallback(async (remote: RemoteMissionDraft) => {
    if (dirty && !window.confirm("Load this ChatGPT draft into the workshop? The current workshop draft will be replaced.")) return;
    const next = cloneMission(remote.mission);
    setDraft(next);
    setSavedSignature(null);
    setValidationIssues([]);
    setStatusMessage(`${next.title} LOADED FROM THE CHATGPT DRAFT INBOX · REVIEW BEFORE SAVING`);

    try {
      const response = await fetch(`/api/mission-drafts?room=${encodeURIComponent(room)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-friend-computer-gm-key": gmKey },
        body: JSON.stringify({ draftId: remote.id }),
      });
      if (response.ok) setRemoteDrafts((current) => current.filter((item) => item.id !== remote.id));
    } catch {
      // The draft is already loaded locally; leaving it in the inbox is recoverable.
    }
  }, [dirty, gmKey, room]);

  const validate = useCallback(() => {
    const issues = validateDraft(draft);
    setValidationIssues(issues);
    setStatusMessage(issues.length ? `VALIDATION FOUND ${issues.length} ISSUE${issues.length === 1 ? "" : "S"}` : "MISSION VALID · READY TO SAVE OR DOWNLOAD");
    return issues;
  }, [draft]);

  const saveToLibrary = useCallback(() => {
    const issues = validateDraft(draft);
    setValidationIssues(issues);
    if (issues.length) {
      setStatusMessage("MISSION NOT SAVED · CORRECT VALIDATION ISSUES");
      return;
    }
    if (BUILT_IN_MISSION_PACKAGES.some((mission) => mission.id === draft.id)) {
      setValidationIssues([`Mission ID "${draft.id}" is reserved by a built-in mission. Change the ID before saving.`]);
      setStatusMessage("MISSION NOT SAVED · BUILT-IN ID IS RESERVED");
      return;
    }
    const parsed = parseMissionPackageFile(draft);
    const existing = importedMissions.find((mission) => mission.id === parsed.id);
    if (existing && !window.confirm(`Replace the saved custom mission "${existing.title}" with this workshop version?`)) return;
    const next = [...importedMissions.filter((mission) => mission.id !== parsed.id), parsed];
    try {
      storeImportedMissions(next);
      setImportedMissions(next);
      setDraft(parsed);
      setSavedSignature(JSON.stringify(parsed));
      setStatusMessage(`${parsed.title} SAVED TO THE MISSION LIBRARY`);
    } catch {
      setValidationIssues(["Browser storage is unavailable. Download the mission file to preserve this draft."]);
      setStatusMessage("MISSION NOT SAVED · BROWSER STORAGE UNAVAILABLE");
    }
  }, [draft, importedMissions]);

  const downloadDraft = useCallback(() => {
    const issues = validateDraft(draft);
    setValidationIssues(issues);
    if (issues.length) {
      setStatusMessage("MISSION NOT DOWNLOADED · CORRECT VALIDATION ISSUES");
      return;
    }
    const parsed = parseMissionPackageFile(draft);
    try {
      downloadMissionFile(parsed);
      setStatusMessage(`${parsed.title} DOWNLOADED · PORTABLE MISSION BACKUP CREATED`);
    } catch {
      setValidationIssues(["This browser blocked the mission download. Save to the library or try another browser."]);
      setStatusMessage("MISSION DOWNLOAD BLOCKED BY BROWSER");
    }
  }, [draft]);

  const previewCue = useCallback((cue: MissionCue) => {
    const bus = busRef.current;
    if (!bus || cue.commands.length === 0) {
      setStatusMessage("CUE PREVIEW UNAVAILABLE · ADD A DISPLAY COMMAND");
      return;
    }
    for (const command of cue.commands) bus.send(command);
    setStatusMessage(displayOnline
      ? `PREVIEW SENT: ${cue.label} · ${presence.displays} DISPLAY${presence.displays === 1 ? "" : "S"} ONLINE`
      : `PREVIEW SENT LOCALLY: ${cue.label} · NO REALTIME DISPLAY DETECTED`);
  }, [displayOnline, presence.displays]);

  return (
    <main className="control-shell workshop-shell">
      <header className="control-header workshop-header">
        <div>
          <span className="control-eyebrow">PARTNER-READY AUTHORING · AUTOSAVED DRAFT</span>
          <h1>Mission Workshop</h1>
          <p>Create scenes and Friend Computer cues without hand-editing JSON.</p>
        </div>
        <div className="control-header-actions">
          <Link className="display-link" href={`/importer/${encodeURIComponent(room)}`}>IMPORT STORY</Link>
          <Link className="display-link" href={`/handoff/${encodeURIComponent(room)}`}>GM HANDOFF</Link>
          <Link className="display-link" href={`/mission/${encodeURIComponent(room)}`}>RUN GAME</Link>
          <Link className="display-link" href={`/display/${encodeURIComponent(room)}`} target="_blank">OPEN DISPLAY ↗</Link>
        </div>
      </header>

      <div className="workshop-layout">
        <aside className="panel workshop-library">
          <div className="panel-heading"><span>LIB</span><h2>Mission Library</h2></div>
          <p className="workshop-muted">Load a saved custom mission or copy a built-in mission into a new editable draft.</p>
          <label className="workshop-field">
            <span>SOURCE MISSION</span>
            <select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
              {PORTABLE_BUILT_INS.length ? <optgroup label="BUILT-IN TEMPLATES">{PORTABLE_BUILT_INS.map((mission) => <option value={mission.id} key={mission.id}>{mission.title}</option>)}</optgroup> : null}
              {importedMissions.length ? <optgroup label="CUSTOM MISSIONS">{importedMissions.map((mission) => <option value={mission.id} key={mission.id}>{mission.title}</option>)}</optgroup> : null}
            </select>
          </label>
          <div className="workshop-stack">
            <button type="button" onClick={loadSourceMission}>LOAD INTO WORKSHOP</button>
            <button type="button" onClick={beginNewMission}>START NEW MISSION</button>
          </div>
          <div className="workshop-library-stats">
            <span>{importedMissions.length} CUSTOM SAVED</span>
            <span>{draft.director.scenes.length} SCENE{draft.director.scenes.length === 1 ? "" : "S"} IN DRAFT</span>
            <span className={dirty ? "workshop-dirty" : "workshop-saved"}>{dirty ? "UNSAVED LIBRARY CHANGES" : "SAVED TO LIBRARY"}</span>
            <span className={displayOnline ? "workshop-saved" : "workshop-muted"}>{displayOnline ? `${presence.displays} DISPLAY ONLINE` : `DISPLAY ${transport.toUpperCase()}`}</span>
          </div>

          <div className="panel-heading workshop-actions-heading"><span>AI</span><h2>ChatGPT Draft Inbox</h2></div>
          <p className="workshop-muted">Approved missions sent through the Mission Author plugin wait here for GM review. Loading one never changes the live game.</p>
          <label className="workshop-field">
            <span>GM AUTHORIZATION · USED ONLY TO OPEN THIS ROOM&apos;S INBOX</span>
            <input type="password" autoComplete="off" value={gmKey} onChange={(event) => setGmKey(event.target.value)} placeholder={sessionReady && restoredFromSession ? "Restored from this browser tab" : "GM AI passphrase"} />
          </label>
          <div className="workshop-stack">
            <button type="button" disabled={inboxBusy || !gmKey.trim()} onClick={() => void loadRemoteDrafts()}>{inboxBusy ? "CHECKING INBOX…" : "CHECK CHATGPT INBOX"}</button>
          </div>
          {remoteDrafts.length ? (
            <div className="workshop-inbox-list">
              {remoteDrafts.map((remote) => (
                <article key={remote.id} className="workshop-inbox-draft">
                  <div>
                    <strong>{remote.title}</strong>
                    <small>{remote.createdBy} · {new Date(remote.createdAt).toLocaleString()}</small>
                  </div>
                  <button type="button" onClick={() => void loadRemoteDraft(remote)}>LOAD DRAFT</button>
                </article>
              ))}
            </div>
          ) : inboxUnlocked ? <div className="workshop-empty">No pending ChatGPT drafts for room {room}.</div> : null}

          <div className="panel-heading workshop-actions-heading"><span>CHK</span><h2>Validate & Save</h2></div>
          <div className="workshop-stack">
            <button type="button" onClick={validate}>VALIDATE MISSION</button>
            <button type="button" className="primary-action" onClick={saveToLibrary}>SAVE TO LIBRARY</button>
            <button type="button" onClick={downloadDraft}>DOWNLOAD MISSION</button>
          </div>
          {statusMessage ? <div className="workshop-status" role="status">{statusMessage}</div> : null}
          {validationIssues.length ? (
            <div className="workshop-validation" role="alert">
              <strong>MISSION NEEDS ATTENTION</strong>
              <ol>{validationIssues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ol>
            </div>
          ) : null}
          <small className="workshop-muted">Drafts autosave only in this room and browser. Save to the Mission Library for use in Mission Director, and download a file for partner handoff.</small>
        </aside>

        <div className="workshop-editor">
          <section className="panel workshop-section">
            <div className="panel-heading"><span>01</span><h2>Mission Identity</h2></div>
            <div className="workshop-form-grid workshop-form-grid--identity">
              <label className="workshop-field"><span>MISSION ID</span><input value={draft.id} onChange={(event) => setMetadata("id", event.target.value.toLowerCase().replace(/\s+/g, "-"))} /></label>
              <label className="workshop-field"><span>TITLE</span><input value={draft.title} onChange={(event) => setMetadata("title", event.target.value)} /></label>
              <label className="workshop-field workshop-field--wide"><span>SUBTITLE</span><input value={draft.subtitle} onChange={(event) => setMetadata("subtitle", event.target.value)} /></label>
              <label className="workshop-field workshop-field--wide"><span>PREMISE</span><textarea value={draft.premise} onChange={(event) => setMetadata("premise", event.target.value)} /></label>
              <label className="workshop-field"><span>PUBLIC STARTING CONTEXT</span><textarea value={draft.publicContext} onChange={(event) => setMetadata("publicContext", event.target.value)} /></label>
              <label className="workshop-field"><span>PRIVATE GM GUIDANCE</span><textarea value={draft.gmGuidance} onChange={(event) => setMetadata("gmGuidance", event.target.value)} /></label>
            </div>
          </section>

          <section className="workshop-scenes-heading">
            <div>
              <span>ORDERED STORY STRUCTURE</span>
              <h2>Scenes & Projector Cues</h2>
            </div>
            <button type="button" onClick={addScene}>＋ ADD SCENE</button>
          </section>

          {draft.director.scenes.map((scene, sceneIndex) => (
            <details className="panel workshop-scene" key={`scene-${sceneIndex}`}>
              <summary>
                <span className="workshop-scene__number">{scene.number || String(sceneIndex + 1).padStart(2, "0")}</span>
                <div><strong>{scene.title || "UNTITLED SCENE"}</strong><small>{scene.location || "LOCATION NOT SET"} · {scene.cues.length} CUE{scene.cues.length === 1 ? "" : "S"}</small></div>
                <span className="workshop-scene__expand">EDIT ▾</span>
              </summary>
              <div className="workshop-scene__body">
                <div className="workshop-order-controls">
                  <button type="button" disabled={sceneIndex === 0} onClick={() => reorderScene(sceneIndex, -1)}>↑ MOVE UP</button>
                  <button type="button" disabled={sceneIndex === draft.director.scenes.length - 1} onClick={() => reorderScene(sceneIndex, 1)}>↓ MOVE DOWN</button>
                  <button type="button" className="danger" disabled={draft.director.scenes.length === 1} onClick={() => removeScene(sceneIndex)}>REMOVE SCENE</button>
                </div>
                <div className="workshop-form-grid">
                  <label className="workshop-field"><span>SCENE NUMBER</span><input value={scene.number} onChange={(event) => updateScene(sceneIndex, { number: event.target.value })} /></label>
                  <label className="workshop-field"><span>SCENE ID</span><input value={scene.id} onChange={(event) => updateScene(sceneIndex, { id: event.target.value.toLowerCase().replace(/\s+/g, "-") })} /></label>
                  <label className="workshop-field"><span>SCENE TITLE</span><input value={scene.title} onChange={(event) => updateScene(sceneIndex, { title: event.target.value })} /></label>
                  <label className="workshop-field"><span>LOCATION</span><input value={scene.location} onChange={(event) => updateScene(sceneIndex, { location: event.target.value })} /></label>
                  <label className="workshop-field workshop-field--wide"><span>WHAT HAPPENS</span><textarea value={scene.scene} onChange={(event) => updateScene(sceneIndex, { scene: event.target.value })} /></label>
                  <label className="workshop-field workshop-field--wide"><span>PLAYER OBJECTIVE</span><textarea value={scene.objective} onChange={(event) => updateScene(sceneIndex, { objective: event.target.value })} /></label>
                  <label className="workshop-field"><span>PUBLIC SCENE CONTEXT</span><textarea value={scene.publicContext} onChange={(event) => updateScene(sceneIndex, { publicContext: event.target.value })} /></label>
                  <label className="workshop-field"><span>PRIVATE GM GUIDANCE</span><textarea value={scene.gmGuidance} onChange={(event) => updateScene(sceneIndex, { gmGuidance: event.target.value })} /></label>
                  <label className="workshop-field"><span>HANDOUTS · ONE PER LINE</span><textarea value={scene.handouts.join("\n")} onChange={(event) => updateScene(sceneIndex, { handouts: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} /></label>
                  <label className="workshop-field"><span>SCENE LOG VISIBILITY</span><select value={scene.logVisibility} onChange={(event) => updateScene(sceneIndex, { logVisibility: event.target.value as MissionScene["logVisibility"] })}>{LOG_VISIBILITIES.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
                </div>

                <div className="workshop-cues-heading"><h3>Friend Computer Cues</h3><button type="button" onClick={() => addCue(sceneIndex)}>＋ ADD CUE</button></div>
                <div className="workshop-cue-list">
                  {scene.cues.map((cue, cueIndex) => {
                    const speech = findCommand(cue.commands, "speak");
                    const status = findCommand(cue.commands, "set-status");
                    const expression = findCommand(cue.commands, "set-expression");
                    const threat = findCommand(cue.commands, "set-threat");
                    const effect = findCommand(cue.commands, "effect");
                    const patrol = findCommand(cue.commands, "set-patrol");
                    const gaze = findCommand(cue.commands, "set-gaze");
                    return (
                      <details className="workshop-cue" key={`cue-${sceneIndex}-${cueIndex}`}>
                        <summary><strong>{cue.label || "UNTITLED CUE"}</strong><span>{cue.commands.length} COMMAND{cue.commands.length === 1 ? "" : "S"} · EDIT ▾</span></summary>
                        <div className="workshop-cue__body">
                          <div className="workshop-order-controls">
                            <button type="button" disabled={cueIndex === 0} onClick={() => reorderCue(sceneIndex, cueIndex, -1)}>↑</button>
                            <button type="button" disabled={cueIndex === scene.cues.length - 1} onClick={() => reorderCue(sceneIndex, cueIndex, 1)}>↓</button>
                            <button type="button" onClick={() => previewCue(cue)}>PREVIEW ON DISPLAY</button>
                            <button type="button" className="danger" onClick={() => removeCue(sceneIndex, cueIndex)}>REMOVE CUE</button>
                          </div>
                          <div className="workshop-form-grid">
                            <label className="workshop-field"><span>CUE ID</span><input value={cue.id} onChange={(event) => updateCue(sceneIndex, cueIndex, { id: event.target.value.toLowerCase().replace(/\s+/g, "-") })} /></label>
                            <label className="workshop-field"><span>BUTTON LABEL</span><input value={cue.label} onChange={(event) => updateCue(sceneIndex, cueIndex, { label: event.target.value })} /></label>
                            <label className="workshop-field workshop-field--wide"><span>WHEN TO USE IT</span><input value={cue.note ?? ""} onChange={(event) => updateCue(sceneIndex, cueIndex, { note: event.target.value })} /></label>
                            <label className="workshop-field workshop-field--wide"><span>SPOKEN TEXT · LEAVE BLANK FOR NONE</span><textarea value={speech?.text ?? ""} onChange={(event) => updateCue(sceneIndex, cueIndex, { commands: replaceCommand(cue.commands, "speak", event.target.value ? { type: "speak", text: event.target.value } : undefined) })} /></label>
                            <label className="workshop-field workshop-field--wide"><span>DISPLAY STATUS · LEAVE BLANK FOR NONE</span><input value={status?.text ?? ""} onChange={(event) => updateCue(sceneIndex, cueIndex, { commands: replaceCommand(cue.commands, "set-status", event.target.value ? { type: "set-status", text: event.target.value } : undefined) })} /></label>
                            <label className="workshop-field"><span>EXPRESSION</span><select value={expression?.expression ?? ""} onChange={(event) => updateCue(sceneIndex, cueIndex, { commands: replaceCommand(cue.commands, "set-expression", event.target.value ? { type: "set-expression", expression: event.target.value as Expression, intensity: expression?.intensity ?? 0.7 } : undefined) })}><option value="">NO CHANGE</option>{EXPRESSIONS.map((item) => <option value={item} key={item}>{item.toUpperCase()}</option>)}</select></label>
                            <label className="workshop-field"><span>EXPRESSION INTENSITY</span><input type="number" min="0" max="1" step="0.05" disabled={!expression} value={expression?.intensity ?? 0.7} onChange={(event) => expression ? updateCue(sceneIndex, cueIndex, { commands: replaceCommand(cue.commands, "set-expression", { ...expression, intensity: Number(event.target.value) }) }) : undefined} /></label>
                            <label className="workshop-field"><span>THREAT / CLEARANCE COLOR</span><select value={threat?.level ?? ""} onChange={(event) => updateCue(sceneIndex, cueIndex, { commands: replaceCommand(cue.commands, "set-threat", event.target.value ? { type: "set-threat", level: event.target.value as ThreatLevel } : undefined) })}><option value="">NO CHANGE</option>{THREAT_LEVELS.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
                            <label className="workshop-field"><span>THEATRICAL EFFECT</span><select value={effect?.effect ?? ""} onChange={(event) => updateCue(sceneIndex, cueIndex, { commands: replaceCommand(cue.commands, "effect", event.target.value ? { type: "effect", effect: event.target.value as FriendEffect } : undefined) })}><option value="">NO EFFECT</option>{EFFECTS.map((item) => <option value={item} key={item}>{item.toUpperCase()}</option>)}</select></label>
                            <label className="workshop-field"><span>PATROL GAZE</span><select value={patrol === undefined ? "" : patrol.enabled ? "on" : "off"} onChange={(event) => updateCue(sceneIndex, cueIndex, { commands: replaceCommand(cue.commands, "set-patrol", event.target.value ? { type: "set-patrol", enabled: event.target.value === "on" } : undefined) })}><option value="">NO CHANGE</option><option value="on">TURN ON</option><option value="off">TURN OFF</option></select></label>
                          </div>

                          <details className="workshop-advanced">
                            <summary>ADVANCED GAZE TARGET</summary>
                            <label className="workshop-check"><input type="checkbox" checked={Boolean(gaze)} onChange={(event) => updateCue(sceneIndex, cueIndex, { commands: replaceCommand(cue.commands, "set-gaze", event.target.checked ? { type: "set-gaze", x: 0, y: 0, target: "CENTER" } : undefined) })} /> INCLUDE GAZE COMMAND</label>
                            {gaze ? <div className="workshop-form-grid workshop-form-grid--three"><label className="workshop-field"><span>X · -1 TO 1</span><input type="number" min="-1" max="1" step="0.05" value={gaze.x} onChange={(event) => updateCue(sceneIndex, cueIndex, { commands: replaceCommand(cue.commands, "set-gaze", { ...gaze, x: Number(event.target.value) }) })} /></label><label className="workshop-field"><span>Y · -1 TO 1</span><input type="number" min="-1" max="1" step="0.05" value={gaze.y} onChange={(event) => updateCue(sceneIndex, cueIndex, { commands: replaceCommand(cue.commands, "set-gaze", { ...gaze, y: Number(event.target.value) }) })} /></label><label className="workshop-field"><span>TARGET LABEL</span><input value={gaze.target ?? ""} onChange={(event) => updateCue(sceneIndex, cueIndex, { commands: replaceCommand(cue.commands, "set-gaze", { ...gaze, target: event.target.value || undefined }) })} /></label></div> : null}
                          </details>

                          <details className="workshop-log-editor">
                            <summary>SESSION LOG ENTRY</summary>
                            <label className="workshop-check"><input type="checkbox" checked={Boolean(cue.log)} onChange={(event) => updateCue(sceneIndex, cueIndex, { log: event.target.checked ? { category: "MISSION", visibility: "COMPUTER", importance: "NORMAL", title: cue.label || "Mission event", detail: "Describe the fact Friend Computer should remember after this cue." } : undefined })} /> RECORD THIS CUE IN THE SESSION LOG</label>
                            {cue.log ? <div className="workshop-form-grid workshop-form-grid--three"><label className="workshop-field"><span>CATEGORY</span><select value={cue.log.category} onChange={(event) => updateCue(sceneIndex, cueIndex, { log: { ...cue.log as CueLog, category: event.target.value as CueLog["category"] } })}>{LOG_CATEGORIES.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><label className="workshop-field"><span>VISIBILITY</span><select value={cue.log.visibility} onChange={(event) => updateCue(sceneIndex, cueIndex, { log: { ...cue.log as CueLog, visibility: event.target.value as CueLog["visibility"] } })}>{LOG_VISIBILITIES.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><label className="workshop-field"><span>IMPORTANCE</span><select value={cue.log.importance} onChange={(event) => updateCue(sceneIndex, cueIndex, { log: { ...cue.log as CueLog, importance: event.target.value as CueLog["importance"] } })}>{LOG_IMPORTANCES.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><label className="workshop-field workshop-field--wide"><span>LOG TITLE</span><input value={cue.log.title} onChange={(event) => updateCue(sceneIndex, cueIndex, { log: { ...cue.log as CueLog, title: event.target.value } })} /></label><label className="workshop-field workshop-field--wide"><span>FACT TO REMEMBER</span><textarea value={cue.log.detail} onChange={(event) => updateCue(sceneIndex, cueIndex, { log: { ...cue.log as CueLog, detail: event.target.value } })} /></label></div> : null}
                          </details>
                        </div>
                      </details>
                    );
                  })}
                  {scene.cues.length === 0 ? <div className="workshop-empty">This scene has no projector cues. That is valid; add one if Friend Computer should speak or react.</div> : null}
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </main>
  );
}
