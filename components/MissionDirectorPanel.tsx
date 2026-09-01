"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScenarioDirectorPanel } from "@/components/ScenarioDirectorPanel";
import type { FriendCommand } from "@/lib/friend-computer";
import { useGmSession } from "@/lib/gm-session";
import {
  BUILT_IN_MISSION_PACKAGES,
  parseMissionPackageText,
  type DirectorMissionPackage,
  type SceneMissionPackageFile,
} from "@/lib/mission-package-format";
import type { MissionCue, MissionScene } from "@/lib/mission-package";
import {
  downloadMissionFile,
  loadImportedMissions,
  storeImportedMissions,
} from "@/lib/mission-library";
import { STANDARD_PROJECTOR_PRESETS } from "@/lib/projector-presets";
import { readStoredHandoffConfiguration } from "@/lib/gm-handoff";
import { createSatiateSnapshot } from "@/lib/scenarios";
import { createCommandBus, type CommandBus, type CommandReceipt, type RoomPresence } from "@/lib/transport";

function combinedContext(base: string, heading: string, addition: string) {
  return `${base}\n\n${heading}:\n${addition}`.slice(0, 4000);
}

const DEFAULT_MISSION_ID = BUILT_IN_MISSION_PACKAGES[0].id;

export function MissionDirectorPanel({ room }: { room: string }) {
  const { gmKey, setGmKey, rememberGmKey, sessionReady, restoredFromSession } = useGmSession();
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [transport, setTransport] = useState<CommandBus["transport"]>("connecting");
  const [presence, setPresence] = useState<RoomPresence>({ displays: 0, controls: 0, displayClients: [] });
  const [cueAck, setCueAck] = useState("NO CUE SENT");
  const [packageId, setPackageId] = useState(DEFAULT_MISSION_ID);
  const [importedPackages, setImportedPackages] = useState<SceneMissionPackageFile[]>([]);
  const lastCommandId = useRef<string | null>(null);
  const busRef = useRef<CommandBus | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const autoUnlockAttemptedRef = useRef(false);

  const missionPackages = useMemo(() => {
    const packages = new Map<string, DirectorMissionPackage>();
    for (const mission of BUILT_IN_MISSION_PACKAGES) packages.set(mission.id, mission);
    for (const mission of importedPackages) if (!packages.has(mission.id)) packages.set(mission.id, mission);
    return [...packages.values()];
  }, [importedPackages]);
  const activePackage = missionPackages.find((mission) => mission.id === packageId) ?? missionPackages[0];
  const activePackageIsCustom = importedPackages.some((mission) => mission.id === activePackage.id);
  const activePackageIsPortable = activePackage.director.type === "scenes";

  useEffect(() => {
    try {
      const imported = loadImportedMissions();
      setImportedPackages(imported);
      const preferredMissionId = readStoredHandoffConfiguration(room)?.missionId;
      if (preferredMissionId && [...BUILT_IN_MISSION_PACKAGES, ...imported].some((mission) => mission.id === preferredMissionId)) setPackageId(preferredMissionId);
    } catch {
      setImportedPackages([]);
    }
  }, [room]);

  useEffect(() => {
    const onReceipt = (receipt: CommandReceipt) => {
      if (lastCommandId.current === receipt.id) setCueAck("DISPLAY ACKNOWLEDGED");
    };
    const bus = createCommandBus(room, undefined, setTransport, setPresence, onReceipt);
    busRef.current = bus;
    return () => {
      bus.close();
      busRef.current = null;
    };
  }, [room]);

  const authorizedFetch = useCallback(async (endpoint: string, payload: Record<string, unknown>) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-friend-computer-gm-key": gmKey,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Mission Director request failed.");
    return data;
  }, [gmKey]);

  const unlock = useCallback(async () => {
    if (!gmKey.trim()) return;
    setBusy(true);
    setError("");
    setStatusMessage("");
    try {
      const data = await authorizedFetch("/api/session-context", { action: "get", room });
      const context = data.context && typeof data.context === "object" ? data.context as Record<string, unknown> : null;
      const currentScene = context ? String(context.scene ?? "") : "";
      const missionTitle = context ? String(context.mission_title ?? "") : "";
      const matchingPackage = missionPackages.find((mission) => mission.title === missionTitle);
      if (matchingPackage) setPackageId(matchingPackage.id);
      const scenes = matchingPackage?.director.type === "scenes"
        ? matchingPackage.director.scenes
        : activePackage.director.type === "scenes" ? activePackage.director.scenes : [];
      const matching = scenes.find((scene) => currentScene.startsWith(scene.title));
      setActiveSceneId(matching?.id ?? null);
      setUnlocked(true);
      rememberGmKey();
      setStatusMessage("MISSION PACKAGE AUTHORIZED");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to authorize Mission Director.");
    } finally {
      setBusy(false);
    }
  }, [activePackage, authorizedFetch, gmKey, missionPackages, rememberGmKey, room]);

  useEffect(() => {
    if (!sessionReady || !restoredFromSession || !gmKey.trim() || autoUnlockAttemptedRef.current) return;
    autoUnlockAttemptedRef.current = true;
    void unlock();
  }, [gmKey, restoredFromSession, sessionReady, unlock]);

  const activateScene = useCallback(async (scene: MissionScene) => {
    if (activePackage.director.type !== "scenes") return;
    setBusy(true);
    setError("");
    setStatusMessage("");
    try {
      await authorizedFetch("/api/session-context", {
        action: "save",
        room,
        status: scene.id === "debrief" ? "COMPLETE" : "ACTIVE",
        missionTitle: activePackage.title,
        location: scene.location,
        scene: `${scene.title} — ${scene.scene}`,
        currentObjective: scene.objective,
        publicContext: combinedContext(activePackage.publicContext, "CURRENT SCENE — FRIEND COMPUTER KNOWLEDGE", scene.publicContext),
        gmGuidance: combinedContext(activePackage.gmGuidance, "CURRENT SCENE — PRIVATE GM GUIDANCE", scene.gmGuidance),
      });

      await authorizedFetch("/api/session-events", {
        action: "add",
        room,
        category: scene.id === "debrief" ? "DEBRIEF" : "MISSION",
        visibility: scene.logVisibility,
        importance: "IMPORTANT",
        seat: null,
        title: `Scene activated: ${scene.title}`,
        detail: `${scene.scene} Current objective: ${scene.objective}`,
      });

      setActiveSceneId(scene.id);
      setStatusMessage(`${scene.title} ACTIVE · COPILOT CONTEXT UPDATED`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to activate mission scene.");
    } finally {
      setBusy(false);
    }
  }, [activePackage, authorizedFetch, room]);

  const logCue = useCallback(async (cue: MissionCue) => {
    if (!cue.log) return;
    await authorizedFetch("/api/session-events", {
      action: "add",
      room,
      category: cue.log.category,
      visibility: cue.log.visibility,
      importance: cue.log.importance,
      seat: null,
      title: cue.log.title,
      detail: cue.log.detail,
    });
  }, [authorizedFetch, room]);

  const runCue = useCallback(async (cue: MissionCue) => {
    const bus = busRef.current;
    if (!bus) {
      setError("Display command bus is unavailable.");
      return;
    }

    setError("");
    setStatusMessage(`CUE FIRED: ${cue.label}`);
    setCueAck(presence.displays > 0 ? "AWAITING DISPLAY ACK" : "DISPLAY NOT DETECTED");

    for (const command of cue.commands) {
      lastCommandId.current = bus.send(command);
    }

    try {
      await logCue(cue);
    } catch (reason) {
      setError(reason instanceof Error ? `${reason.message} (cue still fired)` : "Cue fired, but event logging failed.");
    }
  }, [logCue, presence.displays]);

  const sendDirectorCommand = useCallback((command: FriendCommand) => {
    const bus = busRef.current;
    if (!bus) {
      setError("Display command bus is unavailable.");
      return;
    }
    setCueAck(presence.displays > 0 ? "AWAITING DISPLAY ACK" : "DISPLAY NOT DETECTED");
    lastCommandId.current = bus.send(command);
  }, [presence.displays]);

  const selectPackage = useCallback((next: string) => {
    const nextPackage = missionPackages.find((mission) => mission.id === next);
    if (!nextPackage) return;
    setPackageId(next);
    setActiveSceneId(null);
    setStatusMessage(`${nextPackage.title} SELECTED${nextPackage.director.type === "countdown" ? " · COUNTDOWN ON HOLD" : ""}`);
    sendDirectorCommand({ type: "clear-projector-state" });
    if (nextPackage.director.type === "countdown") sendDirectorCommand({ type: "set-scenario", snapshot: createSatiateSnapshot() });
    else sendDirectorCommand({ type: "exit-scenario" });
  }, [missionPackages, sendDirectorCommand]);

  const importMission = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError("");
    try {
      const mission = parseMissionPackageText(await file.text());
      if (BUILT_IN_MISSION_PACKAGES.some((item) => item.id === mission.id)) throw new Error(`Mission id "${mission.id}" is reserved by a built-in package.`);
      const existing = importedPackages.find((item) => item.id === mission.id);
      if (existing && !window.confirm(`Replace the saved custom mission "${existing.title}" with this file?`)) return;
      const next = [...importedPackages.filter((item) => item.id !== mission.id), mission];
      storeImportedMissions(next);
      setImportedPackages(next);
      setPackageId(mission.id);
      setActiveSceneId(null);
      sendDirectorCommand({ type: "exit-scenario" });
      setStatusMessage(`${mission.title} LOADED · SAVED ON THIS GM BROWSER`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load mission file.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [importedPackages, sendDirectorCommand]);

  const downloadMission = useCallback(() => {
    setError("");
    if (activePackage.director.type !== "scenes") {
      setError("This specialized countdown mission cannot be exported as a portable Mission JSON v1 file yet.");
      return;
    }
    downloadMissionFile(activePackage as SceneMissionPackageFile);
    setStatusMessage(`${activePackage.title} EXPORTED · READY TO SHARE OR ARCHIVE`);
  }, [activePackage]);

  const duplicateMission = useCallback(() => {
    setError("");
    if (activePackage.director.type !== "scenes") {
      setError("Specialized countdown missions cannot be duplicated into Mission JSON v1 yet.");
      return;
    }
    const existingIds = new Set(missionPackages.map((mission) => mission.id));
    const stem = `${activePackage.id.slice(0, 54)}-copy`;
    let nextId = stem;
    let suffix = 2;
    while (existingIds.has(nextId)) {
      const ending = `-${suffix}`;
      nextId = `${stem.slice(0, 64 - ending.length)}${ending}`;
      suffix += 1;
    }
    const duplicate: SceneMissionPackageFile = {
      ...activePackage,
      id: nextId,
      title: `${activePackage.title} — COPY`,
      director: { type: "scenes", scenes: activePackage.director.scenes },
    };
    const next = [...importedPackages, duplicate];
    storeImportedMissions(next);
    setImportedPackages(next);
    setPackageId(duplicate.id);
    setActiveSceneId(null);
    setStatusMessage(`${duplicate.title} CREATED · SAVED ON THIS GM BROWSER`);
  }, [activePackage, importedPackages, missionPackages]);

  const removeCustomMission = useCallback(() => {
    if (!activePackageIsCustom) return;
    if (!window.confirm(`Remove the custom mission "${activePackage.title}" from this browser? Export it first if you need a backup.`)) return;
    const next = importedPackages.filter((mission) => mission.id !== activePackage.id);
    storeImportedMissions(next);
    setImportedPackages(next);
    setPackageId(DEFAULT_MISSION_ID);
    setActiveSceneId(null);
    sendDirectorCommand({ type: "exit-scenario" });
    setError("");
    setStatusMessage(`${activePackage.title} REMOVED · BUILT-IN MISSION RESTORED`);
  }, [activePackage.id, activePackage.title, activePackageIsCustom, importedPackages, sendDirectorCommand]);

  const runProjectorPreset = useCallback((preset: (typeof STANDARD_PROJECTOR_PRESETS)[number]) => {
    sendDirectorCommand({ type: "show-projector-state", state: { kind: preset.id, startedAt: Date.now() } });
    sendDirectorCommand({ type: "set-expression", expression: preset.expression, intensity: preset.intensity });
    sendDirectorCommand({ type: "set-threat", level: preset.threat });
    sendDirectorCommand({ type: "set-status", text: preset.status });
    sendDirectorCommand({ type: "speak", text: preset.speak });
    setStatusMessage(`PROJECTOR STATE: ${preset.label}`);
  }, [sendDirectorCommand]);

  const displayOnline = transport === "realtime" && presence.displays > 0;
  const primaryAudioDisplayCount = presence.displayClients?.filter((display) => display.audioRole === "primary").length ?? 0;

  return (
    <main className="control-shell">
      <header className="control-header">
        <div>
          <span className="control-eyebrow">PARANOIA XP · REUSABLE SCENARIO DIRECTOR</span>
          <h1>Mission Director</h1>
        </div>
        <div className="control-header-actions">
          <Link className="display-link" href={`/rehearsal/${encodeURIComponent(room)}`}>REHEARSE MISSION</Link>
          <Link className="display-link" href={`/importer/${encodeURIComponent(room)}`}>IMPORT STORY</Link>
          <Link className="display-link" href={`/workshop/${encodeURIComponent(room)}`}>BUILD MISSION</Link>
          <Link className="display-link" href={`/control/${encodeURIComponent(room)}`}>MANUAL CONTROLS</Link>
          <Link className="display-link" href={`/copilot/${encodeURIComponent(room)}`}>AI COPILOT</Link>
          <Link className="display-link" href={`/session/${encodeURIComponent(room)}`}>MISSION CONTEXT</Link>
          <Link className="display-link" href={`/log/${encodeURIComponent(room)}`}>SESSION LOG</Link>
        </div>
      </header>

      <div className="control-grid">
        <section className="panel" style={{ gridColumn: "1 / -1" }}>
          <div className="panel-heading"><span>DIR</span><h2>{activePackage.title}</h2></div>
          <label className="scenario-package-select">
            <span>SELECT MISSION PACKAGE</span>
            <select value={activePackage.id} onChange={(event) => selectPackage(event.target.value)}>
              {missionPackages.map((mission) => <option key={mission.id} value={mission.id}>{mission.title}</option>)}
            </select>
          </label>
          <div className="mission-package-tools">
            <button type="button" onClick={() => fileInputRef.current?.click()}>LOAD MISSION JSON</button>
            <button type="button" disabled={!activePackageIsPortable} onClick={downloadMission}>DOWNLOAD MISSION</button>
            <button type="button" disabled={!activePackageIsPortable} onClick={duplicateMission}>DUPLICATE AS CUSTOM</button>
            {activePackageIsCustom ? <button type="button" className="danger" onClick={removeCustomMission}>REMOVE CUSTOM</button> : null}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(event) => void importMission(event.target.files?.[0])}
            />
          </div>
          <div className="mission-library-summary">
            <span>{missionPackages.length} MISSION{missionPackages.length === 1 ? "" : "S"} AVAILABLE</span>
            <span>{activePackageIsCustom ? "CUSTOM · STORED ON THIS BROWSER" : "BUILT-IN · READ ONLY"}</span>
            <span>{activePackage.director.type === "scenes" ? `${activePackage.director.scenes.length} SCENES · PORTABLE V1` : "SPECIALIZED COUNTDOWN ENGINE"}</span>
          </div>
          <p style={{ color: "#a8d7da", lineHeight: 1.5, marginTop: 12 }}>{activePackage.premise}</p>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) auto", gap: 10 }}>
            <input
              type="password"
              autoComplete="off"
              value={gmKey}
              onChange={(event) => setGmKey(event.target.value)}
              placeholder="GM AI passphrase"
              aria-label="GM authorization passphrase"
            />
            <button type="button" className="primary-action" disabled={busy || !gmKey.trim()} onClick={() => void unlock()}>
              {busy ? "AUTHORIZING…" : unlocked ? "REFRESH AUTH" : "UNLOCK DIRECTOR"}
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12, fontSize: 11 }}>
            <span style={{ color: displayOnline ? "#87f6fb" : "#ff8d86" }}>{displayOnline ? `● DISPLAY ONLINE (${presence.displays})` : "× DISPLAY NOT DETECTED"}</span>
            <span style={{ color: "#7fa4a8" }}>TRANSPORT: {transport.toUpperCase()}</span>
            <span style={{ color: cueAck === "DISPLAY ACKNOWLEDGED" ? "#87f6fb" : "#b1a56b" }}>{cueAck}</span>
          </div>
          {statusMessage ? <div role="status" style={{ marginTop: 10, color: "#87f6fb", fontSize: 12 }}>{statusMessage}</div> : null}
          {error ? <div role="alert" style={{ marginTop: 10, color: "#ff8d86", fontSize: 12 }}>{error}</div> : null}
          <small style={{ display: "block", marginTop: 10, color: "#6e9499", lineHeight: 1.45 }}>
            {activePackage.director.type === "countdown"
              ? "Selecting this scenario configures the projector on a 90-minute hold. The timer starts only when the GM presses START. Scenario controls use the existing command bus and persistent Mission Context / Session Log."
              : "Scene packages use Friend Computer Mission JSON v1. Activating a scene updates persistent Mission Context and writes an IMPORTANT Session Log entry. Cue buttons act directly on the projector."}
          </small>
        </section>

        {unlocked ? (
          <section className="panel standard-projector-panel">
            <div className="panel-heading"><span>STD</span><h2>Standard Projector States</h2></div>
            <p className="scenario-muted">Available in every mission. Both states are spoken by the Primary Audio display.</p>
            <div className="standard-projector-grid">
              {STANDARD_PROJECTOR_PRESETS.map((preset) => (
                <button type="button" key={preset.id} className={preset.id === "clearance-denied" ? "danger" : ""} onClick={() => runProjectorPreset(preset)}>{preset.speak}</button>
              ))}
              <button type="button" onClick={() => sendDirectorCommand({ type: "clear-projector-state" })}>RETURN TO MISSION DISPLAY</button>
            </div>
            <small className="scenario-muted">{primaryAudioDisplayCount > 0 ? `● PRIMARY AUDIO READY (${primaryAudioDisplayCount})` : "× NO PRIMARY AUDIO DISPLAY · Press M on the display to configure audio."}</small>
          </section>
        ) : null}

        {unlocked && activePackage.director.type === "countdown" ? (
          <ScenarioDirectorPanel
            room={room}
            gmKey={gmKey}
            displayCount={presence.displays}
            primaryAudioDisplayCount={primaryAudioDisplayCount}
            sendCommand={sendDirectorCommand}
          />
        ) : null}

        {unlocked && activePackage.director.type === "scenes" ? activePackage.director.scenes.map((scene) => {
          const active = scene.id === activeSceneId;
          return (
            <section className="panel" key={scene.id} style={{ gridColumn: "1 / -1", borderColor: active ? "#48f6ff" : undefined }}>
              <div className="panel-heading"><span>{scene.number}</span><h2>{scene.title}</h2></div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(220px,.65fr)", gap: 16 }}>
                <div>
                  <div style={{ color: "#87f6fb", fontSize: 11, marginBottom: 6 }}>{active ? "● ACTIVE SCENE" : scene.location}</div>
                  <p style={{ color: "#a8d7da", lineHeight: 1.45, margin: "0 0 8px" }}>{scene.scene}</p>
                  <div style={{ color: "#8fbfc3", fontSize: 12, lineHeight: 1.45 }}><strong>OBJECTIVE:</strong> {scene.objective}</div>
                  <details style={{ marginTop: 10 }}>
                    <summary style={{ cursor: "pointer", color: "#b1a56b", fontSize: 11 }}>GM NOTES</summary>
                    <div style={{ marginTop: 7, color: "#9fb6b8", fontSize: 12, lineHeight: 1.45 }}>{scene.gmGuidance}</div>
                  </details>
                </div>
                <div>
                  <button type="button" className={active ? "is-active" : "primary-action"} disabled={busy} onClick={() => void activateScene(scene)} style={{ width: "100%" }}>
                    {active ? "SCENE ACTIVE" : "ACTIVATE SCENE"}
                  </button>
                  <div style={{ marginTop: 10, padding: 9, border: "1px solid #1e4347", color: "#7fa4a8", fontSize: 11, lineHeight: 1.45 }}>
                    <strong style={{ color: "#8fbfc3" }}>HANDOUTS</strong><br/>
                    {scene.handouts.length ? scene.handouts.map((item) => <span key={item}>• {item}<br/></span>) : "None"}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ color: "#6e9499", fontSize: 10, letterSpacing: ".1em", marginBottom: 7 }}>SCRIPTED COMPUTER CUES</div>
                <div className="button-row" style={{ marginTop: 0 }}>
                  {scene.cues.map((cue) => (
                    <button type="button" key={cue.id} disabled={busy} title={cue.note} onClick={() => void runCue(cue)}>{cue.label}</button>
                  ))}
                </div>
              </div>
            </section>
          );
        }) : null}
      </div>
    </main>
  );
}
