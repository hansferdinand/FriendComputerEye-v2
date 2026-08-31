"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScenarioDirectorPanel } from "@/components/ScenarioDirectorPanel";
import type { FriendCommand } from "@/lib/friend-computer";
import { PARANOIA_XP_ONE_SHOT, type MissionCue, type MissionScene } from "@/lib/mission-package";
import { SATIATE_SCENARIO, createSatiateSnapshot } from "@/lib/scenarios";
import { createCommandBus, type CommandBus, type CommandReceipt, type RoomPresence } from "@/lib/transport";

function combinedContext(base: string, heading: string, addition: string) {
  return `${base}\n\n${heading}:\n${addition}`.slice(0, 4000);
}

type DirectorPackageId = typeof PARANOIA_XP_ONE_SHOT.id | typeof SATIATE_SCENARIO.id;

export function MissionDirectorPanel({ room }: { room: string }) {
  const [gmKey, setGmKey] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [transport, setTransport] = useState<CommandBus["transport"]>("connecting");
  const [presence, setPresence] = useState<RoomPresence>({ displays: 0, controls: 0 });
  const [cueAck, setCueAck] = useState("NO CUE SENT");
  const [packageId, setPackageId] = useState<DirectorPackageId>(PARANOIA_XP_ONE_SHOT.id);
  const lastCommandId = useRef<string | null>(null);
  const busRef = useRef<CommandBus | null>(null);

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
      if (missionTitle === SATIATE_SCENARIO.title) setPackageId(SATIATE_SCENARIO.id);
      const matching = PARANOIA_XP_ONE_SHOT.scenes.find((scene) => currentScene.startsWith(scene.title));
      setActiveSceneId(matching?.id ?? null);
      setUnlocked(true);
      setStatusMessage("MISSION PACKAGE AUTHORIZED");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to authorize Mission Director.");
    } finally {
      setBusy(false);
    }
  }, [authorizedFetch, gmKey, room]);

  const activateScene = useCallback(async (scene: MissionScene) => {
    setBusy(true);
    setError("");
    setStatusMessage("");
    try {
      await authorizedFetch("/api/session-context", {
        action: "save",
        room,
        status: scene.id === "debrief" ? "COMPLETE" : "ACTIVE",
        missionTitle: PARANOIA_XP_ONE_SHOT.title,
        location: scene.location,
        scene: `${scene.title} — ${scene.scene}`,
        currentObjective: scene.objective,
        publicContext: combinedContext(PARANOIA_XP_ONE_SHOT.publicContext, "CURRENT SCENE — FRIEND COMPUTER KNOWLEDGE", scene.publicContext),
        gmGuidance: combinedContext(PARANOIA_XP_ONE_SHOT.gmGuidance, "CURRENT SCENE — PRIVATE GM GUIDANCE", scene.gmGuidance),
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
  }, [authorizedFetch, room]);

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

  const selectPackage = useCallback((next: DirectorPackageId) => {
    setPackageId(next);
    setActiveSceneId(null);
    setStatusMessage(next === SATIATE_SCENARIO.id ? "SATIATE-7 CONFIGURED · COUNTDOWN ON HOLD" : "AUTH-22 PACKAGE SELECTED");
    if (next === SATIATE_SCENARIO.id) sendDirectorCommand({ type: "set-scenario", snapshot: createSatiateSnapshot() });
    else sendDirectorCommand({ type: "exit-scenario" });
  }, [sendDirectorCommand]);

  const displayOnline = transport === "realtime" && presence.displays > 0;

  return (
    <main className="control-shell">
      <header className="control-header">
        <div>
          <span className="control-eyebrow">PARANOIA XP · REUSABLE SCENARIO DIRECTOR</span>
          <h1>Mission Director</h1>
        </div>
        <div className="control-header-actions">
          <Link className="display-link" href={`/control/${encodeURIComponent(room)}`}>MANUAL CONTROLS</Link>
          <Link className="display-link" href={`/copilot/${encodeURIComponent(room)}`}>AI COPILOT</Link>
          <Link className="display-link" href={`/session/${encodeURIComponent(room)}`}>MISSION CONTEXT</Link>
          <Link className="display-link" href={`/log/${encodeURIComponent(room)}`}>SESSION LOG</Link>
        </div>
      </header>

      <div className="control-grid">
        <section className="panel" style={{ gridColumn: "1 / -1" }}>
          <div className="panel-heading"><span>DIR</span><h2>{packageId === SATIATE_SCENARIO.id ? SATIATE_SCENARIO.title : PARANOIA_XP_ONE_SHOT.title}</h2></div>
          <label className="scenario-package-select">
            <span>SELECT MISSION PACKAGE</span>
            <select value={packageId} onChange={(event) => selectPackage(event.target.value as DirectorPackageId)}>
              <option value={PARANOIA_XP_ONE_SHOT.id}>{PARANOIA_XP_ONE_SHOT.title}</option>
              <option value={SATIATE_SCENARIO.id}>{SATIATE_SCENARIO.title}</option>
            </select>
          </label>
          <p style={{ color: "#a8d7da", lineHeight: 1.5, marginTop: 12 }}>{packageId === SATIATE_SCENARIO.id ? SATIATE_SCENARIO.premise : PARANOIA_XP_ONE_SHOT.premise}</p>
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
          {statusMessage ? <div style={{ marginTop: 10, color: "#87f6fb", fontSize: 12 }}>{statusMessage}</div> : null}
          {error ? <div style={{ marginTop: 10, color: "#ff8d86", fontSize: 12 }}>{error}</div> : null}
          <small style={{ display: "block", marginTop: 10, color: "#6e9499", lineHeight: 1.45 }}>
            {packageId === SATIATE_SCENARIO.id
              ? "Selecting this scenario configures the projector on a 90-minute hold. The timer starts only when the GM presses START. Scenario controls use the existing command bus and persistent Mission Context / Session Log."
              : "Activating a scene updates persistent Mission Context and writes an IMPORTANT Session Log entry. Cue buttons act directly on the projector and do not require an OpenAI call."}
          </small>
        </section>

        {unlocked && packageId === SATIATE_SCENARIO.id ? (
          <ScenarioDirectorPanel room={room} gmKey={gmKey} displayCount={presence.displays} sendCommand={sendDirectorCommand} />
        ) : null}

        {unlocked && packageId === PARANOIA_XP_ONE_SHOT.id ? PARANOIA_XP_ONE_SHOT.scenes.map((scene) => {
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
