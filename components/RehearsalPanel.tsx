"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  INITIAL_STATE,
  type FriendCommand,
  type FriendComputerState,
  type FriendEffect,
  type ProjectorState,
} from "@/lib/friend-computer";
import {
  BUILT_IN_MISSION_PACKAGES,
  type DirectorMissionPackage,
  type SceneMissionPackageFile,
} from "@/lib/mission-package-format";
import { loadImportedMissions } from "@/lib/mission-library";
import type { MissionCue } from "@/lib/mission-package";
import { STANDARD_PROJECTOR_PRESETS } from "@/lib/projector-presets";
import { readStoredHandoffConfiguration } from "@/lib/gm-handoff";
import {
  readRehearsalSession,
  writeRehearsalSession,
  type RehearsalSessionState,
} from "@/lib/rehearsal";
import {
  SATIATE_DURATION_MS,
  SATIATE_MESSAGE_PRESETS,
  SATIATE_OUTCOMES,
  SATIATE_PRESETS,
  SATIATE_REMINDERS,
} from "@/lib/scenarios";
import { formatScenarioTime, type ScenarioPresentation } from "@/lib/scenario-runtime";

const TIMER_SPEEDS = [
  { value: 1, label: "REAL TIME" },
  { value: 60, label: "1 MINUTE / SECOND" },
  { value: 3_600, label: "1 HOUR / SECOND" },
  { value: 86_400, label: "1 DAY / SECOND" },
  { value: 31_536_000, label: "1 YEAR / SECOND" },
] as const;

const TIMER_UNITS = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 604_800_000,
  years: 31_536_000_000,
} as const;

type TimerUnit = keyof typeof TIMER_UNITS;

type PracticeTimer = {
  kind: "loading" | "countdown";
  label: string;
  unit?: TimerUnit;
  totalMs: number;
  remainingMs: number;
  speed: number;
  running: boolean;
};

type SimulatedDisplay = FriendComputerState & {
  effect: FriendEffect | null;
  lastSpeech: string;
  projectorState: ProjectorState | null;
  scenarioPresentation: ScenarioPresentation | null;
};

const INITIAL_SIMULATED_DISPLAY: SimulatedDisplay = {
  ...INITIAL_STATE,
  effect: null,
  lastSpeech: "SIMULATED AUDIO TRANSCRIPT WILL APPEAR HERE",
  projectorState: null,
  scenarioPresentation: null,
};

function createSession(missionId: string, active = false): RehearsalSessionState {
  return {
    version: 1,
    active,
    missionId,
    activeSceneId: null,
    testedIds: [],
    completedSceneIds: [],
    updatedAt: Date.now(),
  };
}

function mergeMissionPackages(imported: SceneMissionPackageFile[]) {
  const packages = new Map<string, DirectorMissionPackage>();
  for (const mission of BUILT_IN_MISSION_PACKAGES) packages.set(mission.id, mission);
  for (const mission of imported) if (!packages.has(mission.id)) packages.set(mission.id, mission);
  return [...packages.values()];
}

function cueTestId(sceneId: string, cueId: string) {
  return `cue:${sceneId}:${cueId}`;
}

function timerProgress(timer: PracticeTimer | null) {
  if (!timer || timer.totalMs <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - timer.remainingMs / timer.totalMs));
}

function formatLoadingRemaining(timer: PracticeTimer, unit: TimerUnit) {
  if (timer.remainingMs <= 0) return "LOOKUP COMPLETE";
  const amount = timer.remainingMs / TIMER_UNITS[unit];
  const digits = amount >= 100 ? 0 : amount >= 10 ? 1 : 2;
  return `${amount.toFixed(digits)} ${unit.toUpperCase()} REMAINING`;
}

export function RehearsalPanel({ room }: { room: string }) {
  const router = useRouter();
  const [missionPackages, setMissionPackages] = useState<DirectorMissionPackage[]>(BUILT_IN_MISSION_PACKAGES);
  const [session, setSession] = useState<RehearsalSessionState>(() => createSession(BUILT_IN_MISSION_PACKAGES[0].id));
  const [ready, setReady] = useState(false);
  const [display, setDisplay] = useState<SimulatedDisplay>(INITIAL_SIMULATED_DISPLAY);
  const [history, setHistory] = useState<string[]>([]);
  const [timer, setTimer] = useState<PracticeTimer | null>(null);
  const [timerUnit, setTimerUnit] = useState<TimerUnit>("years");
  const [timerAmount, setTimerAmount] = useState("10");
  const [timerLabel, setTimerLabel] = useState("PLEASE WAIT WHILE I LOOK THAT UP");
  const [timerSpeed, setTimerSpeed] = useState(31_536_000);
  const [statusMessage, setStatusMessage] = useState("SAFE SANDBOX READY · NO LIVE OUTPUT");

  const activeMission = missionPackages.find((mission) => mission.id === session.missionId) ?? missionPackages[0];
  const testedSet = useMemo(() => new Set(session.testedIds), [session.testedIds]);
  const activeSceneIndex = activeMission.director.type === "scenes"
    ? Math.max(0, activeMission.director.scenes.findIndex((scene) => scene.id === session.activeSceneId))
    : -1;
  const activeScene = activeMission.director.type === "scenes" ? activeMission.director.scenes[activeSceneIndex] : null;

  const requiredTestIds = useMemo(() => {
    const standard = STANDARD_PROJECTOR_PRESETS.map((preset) => `projector:${preset.id}`);
    if (activeMission.director.type === "scenes") {
      return [
        ...activeMission.director.scenes.flatMap((scene) => scene.cues.map((cue) => cueTestId(scene.id, cue.id))),
        ...standard,
        "timer:loading",
      ];
    }
    return [
      ...SATIATE_PRESETS.map((preset) => `scenario:preset:${preset.id}`),
      ...SATIATE_MESSAGE_PRESETS.map((_, index) => `scenario:message:${index}`),
      ...Object.keys(SATIATE_OUTCOMES).map((id) => `scenario:outcome:${id}`),
      "scenario:timer",
      ...standard,
      "timer:loading",
    ];
  }, [activeMission]);

  const completedSceneCount = activeMission.director.type === "scenes"
    ? activeMission.director.scenes.filter((scene) => session.completedSceneIds.includes(scene.id)).length
    : 0;
  const sceneCompletionReady = activeMission.director.type !== "scenes" || completedSceneCount === activeMission.director.scenes.length;
  const testedCount = requiredTestIds.filter((id) => testedSet.has(id)).length;
  const readyForPreShow = sceneCompletionReady && testedCount === requiredTestIds.length;

  useEffect(() => {
    let imported: SceneMissionPackageFile[] = [];
    try {
      imported = loadImportedMissions();
    } catch {
      setStatusMessage("CUSTOM MISSIONS COULD NOT BE LOADED · BUILT-IN MISSIONS AVAILABLE");
    }
    const packages = mergeMissionPackages(imported);
    setMissionPackages(packages);
    try {
      const saved = readRehearsalSession(room);
      if (saved && packages.some((mission) => mission.id === saved.missionId)) setSession(saved);
      else {
        const preferredMissionId = readStoredHandoffConfiguration(room)?.missionId;
        if (preferredMissionId && packages.some((mission) => mission.id === preferredMissionId)) setSession(createSession(preferredMissionId));
      }
    } catch {
      setStatusMessage("REHEARSAL PROGRESS COULD NOT BE RESTORED · FRESH SANDBOX OPENED");
    }
    setReady(true);
  }, [room]);

  useEffect(() => {
    if (!ready) return;
    try {
      writeRehearsalSession(room, { ...session, updatedAt: Date.now() });
    } catch {
      setStatusMessage("REHEARSAL PROGRESS IS NOT PERSISTING · KEEP THIS TAB OPEN");
    }
  }, [ready, room, session]);

  useEffect(() => {
    if (!timer?.running) return;
    let previous = Date.now();
    const interval = window.setInterval(() => {
      const now = Date.now();
      const elapsed = now - previous;
      previous = now;
      setTimer((current) => {
        if (!current?.running) return current;
        const remainingMs = Math.max(0, current.remainingMs - elapsed * current.speed);
        return { ...current, remainingMs, running: remainingMs > 0 };
      });
    }, 100);
    return () => window.clearInterval(interval);
  }, [timer?.running]);

  const addHistory = useCallback((message: string) => {
    setHistory((current) => [message, ...current].slice(0, 12));
  }, []);

  const markTested = useCallback((id: string) => {
    setSession((current) => current.testedIds.includes(id)
      ? current
      : { ...current, testedIds: [...current.testedIds, id] });
  }, []);

  const applyCommand = useCallback((command: FriendCommand) => {
    setDisplay((current) => {
      switch (command.type) {
        case "set-gaze": return { ...current, gaze: { x: command.x, y: command.y, target: command.target } };
        case "set-expression": return { ...current, expression: command.expression, intensity: command.intensity ?? current.intensity };
        case "set-threat": return { ...current, threat: command.level };
        case "set-status": return { ...current, status: command.text };
        case "set-patrol": return { ...current, patrol: command.enabled };
        case "speak": return { ...current, lastSpeech: command.text };
        case "show-projector-state": return { ...current, projectorState: command.state };
        case "clear-projector-state": return { ...current, projectorState: null };
        case "effect": {
          if (command.effect === "reset") return { ...INITIAL_SIMULATED_DISPLAY, lastSpeech: "SIMULATED DISPLAY RESET" };
          if (command.effect === "toggle-eye") return { ...current, eyeVisible: !current.eyeVisible, effect: command.effect };
          return { ...current, effect: command.effect };
        }
        case "clear-loading-timer":
        case "set-loading-timer":
        case "set-scenario":
        case "exit-scenario":
          return current;
      }
    });
  }, []);

  const runCue = useCallback((cue: MissionCue, sceneId: string) => {
    if (!session.active) return;
    for (const command of cue.commands) applyCommand(command);
    const id = cueTestId(sceneId, cue.id);
    markTested(id);
    addHistory(`CUE TESTED · ${cue.label}`);
    setStatusMessage(`${cue.label} RAN ONLY ON THE SIMULATED PROJECTOR`);
  }, [addHistory, applyCommand, markTested, session.active]);

  const resetDisplay = useCallback(() => {
    setDisplay(INITIAL_SIMULATED_DISPLAY);
    setTimer(null);
    addHistory("SIMULATED PROJECTOR RESET");
  }, [addHistory]);

  const resetRehearsal = useCallback(() => {
    if (!window.confirm("Reset rehearsal progress, checklist, timer, and simulated display to a clean mission start? No live game data will be changed.")) return;
    setSession(createSession(activeMission.id, true));
    setDisplay(INITIAL_SIMULATED_DISPLAY);
    setTimer(null);
    setHistory([]);
    setStatusMessage("REHEARSAL RESET · CLEAN MISSION START RESTORED");
  }, [activeMission.id]);

  const selectMission = useCallback((missionId: string) => {
    if ((session.testedIds.length > 0 || session.completedSceneIds.length > 0)
      && !window.confirm("Switch rehearsal missions and clear the current rehearsal checklist?")) return;
    setSession(createSession(missionId, session.active));
    setDisplay(INITIAL_SIMULATED_DISPLAY);
    setTimer(null);
    setHistory([]);
    setStatusMessage("MISSION LOADED INTO THE SAFE REHEARSAL SANDBOX");
  }, [session.active, session.completedSceneIds.length, session.testedIds.length]);

  const beginRehearsal = useCallback(() => {
    setSession((current) => ({ ...current, active: true }));
    setStatusMessage("REHEARSAL ACTIVE · LIVE CONTEXT, LOGS, MESSAGES, NOTICES, AND DISPLAYS ARE ISOLATED");
  }, []);

  const endRehearsal = useCallback(() => {
    setSession((current) => ({ ...current, active: false }));
    setStatusMessage("REHEARSAL PAUSED · CHECKLIST PRESERVED");
  }, []);

  const chooseScene = useCallback((sceneId: string) => {
    setSession((current) => ({ ...current, activeSceneId: sceneId }));
    setStatusMessage("SCENE SELECTED · NO MISSION CONTEXT OR SESSION LOG WRITE");
  }, []);

  const toggleSceneComplete = useCallback((sceneId: string) => {
    setSession((current) => ({
      ...current,
      completedSceneIds: current.completedSceneIds.includes(sceneId)
        ? current.completedSceneIds.filter((id) => id !== sceneId)
        : [...current.completedSceneIds, sceneId],
    }));
  }, []);

  const runProjectorPreset = useCallback((preset: (typeof STANDARD_PROJECTOR_PRESETS)[number]) => {
    if (!session.active) return;
    setDisplay((current) => ({
      ...current,
      projectorState: { kind: preset.id, startedAt: Date.now() },
      expression: preset.expression,
      intensity: preset.intensity,
      threat: preset.threat,
      status: preset.status,
      lastSpeech: preset.speak,
    }));
    markTested(`projector:${preset.id}`);
    addHistory(`PROJECTOR STATE TESTED · ${preset.label}`);
  }, [addHistory, markTested, session.active]);

  const startLoadingTimer = useCallback(() => {
    if (!session.active) return;
    const amount = Number(timerAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setStatusMessage("TIMER AMOUNT MUST BE GREATER THAN ZERO");
      return;
    }
    const totalMs = Math.min(10_000, amount) * TIMER_UNITS[timerUnit];
    setTimer({ kind: "loading", label: timerLabel.trim() || "PLEASE WAIT WHILE I LOOK THAT UP", unit: timerUnit, totalMs, remainingMs: totalMs, speed: timerSpeed, running: true });
    markTested("timer:loading");
    addHistory(`ACCELERATED LOADING TIMER STARTED · ${timerSpeed.toLocaleString()}×`);
  }, [addHistory, markTested, session.active, timerAmount, timerLabel, timerSpeed, timerUnit]);

  const startScenarioTimer = useCallback(() => {
    if (!session.active) return;
    setTimer({ kind: "countdown", label: "SATIATE-7 COUNTDOWN", totalMs: SATIATE_DURATION_MS, remainingMs: SATIATE_DURATION_MS, speed: timerSpeed, running: true });
    markTested("scenario:timer");
    addHistory(`SATIATE-7 COUNTDOWN STARTED · ${timerSpeed.toLocaleString()}×`);
  }, [addHistory, markTested, session.active, timerSpeed]);

  const runScenarioPreset = useCallback((preset: (typeof SATIATE_PRESETS)[number]) => {
    if (!session.active) return;
    setDisplay((current) => ({
      ...current,
      scenarioPresentation: preset.presentation,
      expression: preset.expression,
      intensity: preset.intensity,
      threat: preset.threat,
      status: preset.presentation.headline,
      lastSpeech: preset.speak ?? current.lastSpeech,
    }));
    markTested(`scenario:preset:${preset.id}`);
    addHistory(`SATIATE-7 STATE TESTED · ${preset.label}`);
  }, [addHistory, markTested, session.active]);

  const runScenarioMessage = useCallback((message: string, index: number) => {
    if (!session.active) return;
    setDisplay((current) => ({ ...current, status: message.toUpperCase(), lastSpeech: message }));
    markTested(`scenario:message:${index}`);
    addHistory(`MESSAGE TESTED · ${index + 1}`);
  }, [addHistory, markTested, session.active]);

  const runOutcome = useCallback((id: keyof typeof SATIATE_OUTCOMES) => {
    if (!session.active) return;
    const outcome = SATIATE_OUTCOMES[id];
    setDisplay((current) => ({
      ...current,
      scenarioPresentation: { kind: "announcement", eyebrow: "SATIATE-7 FINAL OUTCOME", headline: outcome.headline, detail: outcome.detail },
      status: outcome.headline,
      lastSpeech: outcome.detail,
    }));
    markTested(`scenario:outcome:${id}`);
    addHistory(`ENDING TESTED · ${outcome.label}`);
  }, [addHistory, markTested, session.active]);

  const moveScene = useCallback((direction: -1 | 1) => {
    if (activeMission.director.type !== "scenes") return;
    const nextIndex = Math.min(activeMission.director.scenes.length - 1, Math.max(0, activeSceneIndex + direction));
    chooseScene(activeMission.director.scenes[nextIndex].id);
  }, [activeMission, activeSceneIndex, chooseScene]);

  const goToReadiness = useCallback(() => {
    if (!readyForPreShow || !window.confirm("Mark rehearsal complete and open Show Readiness? This pauses rehearsal and does not start or modify the live session.")) return;
    setSession((current) => ({ ...current, active: false }));
    router.push(`/readiness/${encodeURIComponent(room)}`);
  }, [readyForPreShow, room, router]);

  const projectorProgress = timerProgress(timer);
  const simulatedStatus = display.scenarioPresentation?.headline ?? display.status;

  return (
    <main className="control-shell rehearsal-shell">
      <header className="control-header rehearsal-header">
        <div>
          <span className="control-eyebrow">ISOLATED PRACTICE ENVIRONMENT · ZERO LIVE WRITES</span>
          <h1>Rehearsal Mode</h1>
        </div>
        <div className="rehearsal-header__actions">
          <Link className="display-link" href={`/handoff/${encodeURIComponent(room)}`}>GM HANDOFF</Link>
          <span className={session.active ? "rehearsal-active-chip" : "rehearsal-paused-chip"}>{session.active ? "● REHEARSAL ACTIVE" : "○ REHEARSAL PAUSED"}</span>
          {session.active
            ? <button type="button" onClick={endRehearsal}>PAUSE REHEARSAL</button>
            : <button type="button" className="primary-action" onClick={beginRehearsal}>BEGIN REHEARSAL</button>}
        </div>
      </header>

      <section className="rehearsal-isolation" role="status">
        <strong>REHEARSAL</strong>
        <span>Commands stay inside this simulated projector. Mission Context, Session Log, citizen messages, notices, and real displays are untouched.</span>
      </section>

      <section className="panel rehearsal-mission-bar">
        <label>
          <span>MISSION UNDER TEST</span>
          <select value={activeMission.id} onChange={(event) => selectMission(event.target.value)}>
            {missionPackages.map((mission) => <option value={mission.id} key={mission.id}>{mission.title}</option>)}
          </select>
        </label>
        <div className="rehearsal-progress-summary">
          <span>{testedCount} / {requiredTestIds.length} TESTS PASSED</span>
          {activeMission.director.type === "scenes" ? <span>{completedSceneCount} / {activeMission.director.scenes.length} SCENES COMPLETE</span> : <span>SPECIALIZED COUNTDOWN REHEARSAL</span>}
          <span>{readyForPreShow ? "READY FOR PRE-SHOW" : "PREFLIGHT INCOMPLETE"}</span>
        </div>
        <p>{activeMission.premise}</p>
        {statusMessage ? <div className="workshop-status">{statusMessage}</div> : null}
      </section>

      <div className="rehearsal-layout">
        <div className="rehearsal-runbook">
          {activeMission.director.type === "scenes" && activeScene ? (
            <section className="panel rehearsal-scene-panel">
              <div className="panel-heading"><span>{activeScene.number}</span><h2>{activeScene.title}</h2></div>
              <div className="rehearsal-scene-nav">
                <button type="button" disabled={activeSceneIndex === 0} onClick={() => moveScene(-1)}>← PREVIOUS</button>
                <select aria-label="Rehearsal scene" value={activeScene.id} onChange={(event) => chooseScene(event.target.value)}>
                  {activeMission.director.scenes.map((scene) => <option value={scene.id} key={scene.id}>{scene.number} · {scene.title}</option>)}
                </select>
                <button type="button" disabled={activeSceneIndex === activeMission.director.scenes.length - 1} onClick={() => moveScene(1)}>NEXT →</button>
              </div>
              <div className="rehearsal-scene-copy">
                <div><span>LOCATION</span><strong>{activeScene.location}</strong></div>
                <div><span>PLAYER OBJECTIVE</span><p>{activeScene.objective}</p></div>
                <div><span>PRIVATE GM GUIDANCE</span><p>{activeScene.gmGuidance}</p></div>
              </div>
              <label className="rehearsal-scene-complete">
                <input type="checkbox" checked={session.completedSceneIds.includes(activeScene.id)} onChange={() => toggleSceneComplete(activeScene.id)} />
                SCENE PACING AND TRANSITION REHEARSED
              </label>
              <div className="rehearsal-cue-checklist">
                <h3>Projector Cue Checklist</h3>
                {activeScene.cues.length ? activeScene.cues.map((cue) => {
                  const id = cueTestId(activeScene.id, cue.id);
                  const tested = testedSet.has(id);
                  return (
                    <article className={tested ? "rehearsal-test rehearsal-test--passed" : "rehearsal-test"} key={id}>
                      <div><span>{tested ? "✓ TESTED" : "○ NOT TESTED"}</span><strong>{cue.label}</strong><small>{cue.note || `${cue.commands.length} simulated display command${cue.commands.length === 1 ? "" : "s"}`}</small></div>
                      <button type="button" disabled={!session.active} onClick={() => runCue(cue, activeScene.id)}>{tested ? "RUN AGAIN" : "RUN TEST"}</button>
                    </article>
                  );
                }) : <div className="workshop-empty">No projector cues in this scene. Mark the scene complete after practicing its pacing.</div>}
              </div>
            </section>
          ) : (
            <>
              <section className="panel rehearsal-scenario-panel">
                <div className="panel-heading"><span>90</span><h2>SATIATE-7 Countdown Tests</h2></div>
                <div className="rehearsal-timer-controls">
                  <select aria-label="Rehearsal timer speed" value={timerSpeed} onChange={(event) => setTimerSpeed(Number(event.target.value))}>{TIMER_SPEEDS.map((speed) => <option value={speed.value} key={speed.value}>{speed.label}</option>)}</select>
                  <button type="button" disabled={!session.active} onClick={startScenarioTimer}>START 90-MINUTE TEST</button>
                  <button type="button" disabled={!timer || timer.kind !== "countdown"} onClick={() => setTimer((current) => current ? { ...current, running: !current.running } : null)}>{timer?.running ? "PAUSE" : "RESUME"}</button>
                </div>
                <div className="rehearsal-test-grid">
                  {SATIATE_PRESETS.map((preset) => <button type="button" disabled={!session.active} className={testedSet.has(`scenario:preset:${preset.id}`) ? "is-tested" : ""} key={preset.id} onClick={() => runScenarioPreset(preset)}>{testedSet.has(`scenario:preset:${preset.id}`) ? "✓ " : ""}{preset.label}</button>)}
                </div>
                <details className="rehearsal-reference"><summary>GM MILESTONE REFERENCE · {SATIATE_REMINDERS.length} ITEMS</summary>{SATIATE_REMINDERS.map((reminder) => <div key={reminder.id}><strong>{formatScenarioTime(reminder.atMs)}</strong><span>{reminder.label} · {reminder.detail}</span></div>)}</details>
              </section>
              <section className="panel rehearsal-scenario-panel">
                <div className="panel-heading"><span>MSG</span><h2>Scenario Messages</h2></div>
                <div className="rehearsal-message-list">{SATIATE_MESSAGE_PRESETS.map((message, index) => <button type="button" disabled={!session.active} className={testedSet.has(`scenario:message:${index}`) ? "is-tested" : ""} key={message} onClick={() => runScenarioMessage(message, index)}>{testedSet.has(`scenario:message:${index}`) ? "✓ " : ""}{message}</button>)}</div>
              </section>
              <section className="panel rehearsal-scenario-panel">
                <div className="panel-heading"><span>END</span><h2>Ending Variants</h2></div>
                <div className="rehearsal-test-grid">{(Object.entries(SATIATE_OUTCOMES) as [keyof typeof SATIATE_OUTCOMES, (typeof SATIATE_OUTCOMES)[keyof typeof SATIATE_OUTCOMES]][]).map(([id, outcome]) => <button type="button" disabled={!session.active} className={testedSet.has(`scenario:outcome:${id}`) ? "is-tested" : ""} key={id} onClick={() => runOutcome(id)}>{testedSet.has(`scenario:outcome:${id}`) ? "✓ " : ""}{outcome.label}</button>)}</div>
              </section>
            </>
          )}

          <section className="panel rehearsal-standard-tests">
            <div className="panel-heading"><span>STD</span><h2>Standard Projector & Timer Tests</h2></div>
            <div className="rehearsal-test-grid">
              {STANDARD_PROJECTOR_PRESETS.map((preset) => <button type="button" disabled={!session.active} className={testedSet.has(`projector:${preset.id}`) ? "is-tested" : ""} key={preset.id} onClick={() => runProjectorPreset(preset)}>{testedSet.has(`projector:${preset.id}`) ? "✓ " : ""}{preset.label}</button>)}
              <button type="button" disabled={!session.active} onClick={() => setDisplay((current) => ({ ...current, projectorState: null }))}>CLEAR PROJECTOR STATE</button>
            </div>
            <div className="rehearsal-loading-controls">
              <label><span>LABEL</span><input value={timerLabel} onChange={(event) => setTimerLabel(event.target.value)} /></label>
              <label><span>AMOUNT</span><input type="number" min="0.01" max="10000" value={timerAmount} onChange={(event) => setTimerAmount(event.target.value)} /></label>
              <label><span>UNIT</span><select value={timerUnit} onChange={(event) => setTimerUnit(event.target.value as TimerUnit)}>{Object.keys(TIMER_UNITS).map((unit) => <option value={unit} key={unit}>{unit.toUpperCase()}</option>)}</select></label>
              <label><span>TEST SPEED</span><select value={timerSpeed} onChange={(event) => setTimerSpeed(Number(event.target.value))}>{TIMER_SPEEDS.map((speed) => <option value={speed.value} key={speed.value}>{speed.label}</option>)}</select></label>
              <button type="button" disabled={!session.active} className={testedSet.has("timer:loading") ? "is-tested" : ""} onClick={startLoadingTimer}>{testedSet.has("timer:loading") ? "✓ RUN AGAIN" : "START TIMER TEST"}</button>
              <button type="button" disabled={!timer} onClick={() => setTimer(null)}>REMOVE TIMER</button>
            </div>
          </section>
        </div>

        <aside className="rehearsal-simulator-column">
          <section className={`rehearsal-projector rehearsal-projector--${display.threat.toLowerCase()}`} aria-label="Simulated projector">
            <div className="rehearsal-projector__safe">SIMULATED PROJECTOR · NO LIVE OUTPUT</div>
            {display.projectorState?.kind === "clearance-denied" ? (
              <div className="rehearsal-projector__overlay rehearsal-projector__overlay--denied"><span>ALPHA COMPLEX INFORMATION CONTROL</span><strong>THAT INFORMATION ISN&apos;T AVAILABLE AT YOUR CLEARANCE LEVEL</strong><small>REQUEST RECORDED FOR LOYALTY ASSURANCE</small></div>
            ) : display.projectorState?.kind === "records-lookup" ? (
              <div className="rehearsal-projector__overlay"><span>FRIEND COMPUTER ARCHIVAL SERVICES</span><strong>PLEASE WAIT WHILE I LOOK THAT UP</strong><div className="rehearsal-sim-bar"><i style={{ width: "7%" }} /></div><small>ESTIMATED COMPLETION · 37 YEARS</small></div>
            ) : display.scenarioPresentation ? (
              <div className={`rehearsal-projector__scenario rehearsal-projector__scenario--${display.scenarioPresentation.kind}`}><span>{display.scenarioPresentation.eyebrow}</span><strong>{display.scenarioPresentation.headline}</strong><small>{display.scenarioPresentation.detail}</small>{timer?.kind === "countdown" ? <b>{formatScenarioTime(timer.remainingMs)}</b> : null}</div>
            ) : (
              <div className="rehearsal-projector__normal">
                <div className="rehearsal-projector__meta"><span>ALPHAOS · REHEARSAL</span><span>THREAT: {display.threat}</span></div>
                {display.eyeVisible ? <div className={`rehearsal-eye rehearsal-eye--${display.expression} ${display.effect ? `rehearsal-eye--${display.effect}` : ""}`}><i style={{ transform: `translate(${display.gaze.x * 22}px, ${display.gaze.y * 16}px)`, opacity: Math.max(0.35, display.intensity) }} /></div> : <div className="rehearsal-eye-offline">EYE HIDDEN</div>}
                <strong className="rehearsal-projector__status">{simulatedStatus}</strong>
              </div>
            )}
            {timer?.kind === "loading" ? <div className="rehearsal-sim-timer"><div><span>{timer.label}</span><strong>{formatLoadingRemaining(timer, timer.unit ?? timerUnit)}</strong></div><div className="rehearsal-sim-bar"><i style={{ width: `${projectorProgress * 100}%` }} /></div></div> : null}
            <div className="rehearsal-projector__speech"><span>SIMULATED AUDIO</span><p>{display.lastSpeech}</p></div>
          </section>

          <section className="panel rehearsal-history">
            <div className="panel-heading"><span>HST</span><h2>Practice History</h2></div>
            {history.length ? history.map((item, index) => <div key={`${item}-${index}`}>{item}</div>) : <p>No rehearsal commands have run.</p>}
          </section>

          <section className="panel rehearsal-finish">
            <div className="panel-heading"><span>GO</span><h2>Rehearsal Exit</h2></div>
            <button type="button" onClick={resetDisplay}>RESET SIMULATED DISPLAY</button>
            <button type="button" className="danger" onClick={resetRehearsal}>RESET ENTIRE REHEARSAL</button>
            <button type="button" className="primary-action" disabled={!readyForPreShow} onClick={goToReadiness}>{readyForPreShow ? "REHEARSAL PASSED · OPEN SHOW READINESS" : `COMPLETE ${requiredTestIds.length - testedCount} MORE TEST${requiredTestIds.length - testedCount === 1 ? "" : "S"}`}</button>
            <small>Passing rehearsal only opens pre-show checks. It never starts the live mission.</small>
          </section>
        </aside>
      </div>
    </main>
  );
}
