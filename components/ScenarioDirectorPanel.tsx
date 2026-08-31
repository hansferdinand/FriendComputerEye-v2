"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FriendCommand } from "@/lib/friend-computer";
import {
  SATIATE_DURATION_MS,
  SATIATE_MESSAGE_PRESETS,
  SATIATE_OUTCOMES,
  SATIATE_PRESETS,
  SATIATE_REMINDERS,
  SATIATE_SCENARIO,
  SATIATE_SUBSYSTEMS,
  createSatiateSnapshot,
  type ScenarioPreset,
} from "@/lib/scenarios";
import {
  formatScenarioTime,
  parseScenarioTime,
  scenarioRemainingMs,
  type SatiateOutcome,
  type SatiateSubsystem,
  type SatiateSubsystemState,
  type ScenarioRuntimeSnapshot,
} from "@/lib/scenario-runtime";

const SUBSYSTEM_STATES: SatiateSubsystemState[] = ["NORMAL", "DAMAGED", "MODIFIED", "DISABLED"];

type Props = {
  room: string;
  gmKey: string;
  displayCount: number;
  primaryAudioDisplayCount: number;
  sendCommand: (command: FriendCommand) => void;
};

function storageKey(room: string) {
  return `friend-computer-scenario:${room}:satiate:v1`;
}

function dismissedKey(room: string) {
  return `friend-computer-scenario:${room}:dismissed:v1`;
}

function isSnapshot(value: unknown): value is ScenarioRuntimeSnapshot {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ScenarioRuntimeSnapshot>;
  return item.version === 1 && item.scenarioId === SATIATE_SCENARIO.id && typeof item.remainingMs === "number";
}

export function ScenarioDirectorPanel({ room, gmKey, displayCount, primaryAudioDisplayCount, sendCommand }: Props) {
  const [snapshot, setSnapshot] = useState<ScenarioRuntimeSnapshot>(() => createSatiateSnapshot());
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [manualTime, setManualTime] = useState("01:30:00");
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey(room));
      const parsed = raw ? JSON.parse(raw) as unknown : null;
      if (isSnapshot(parsed)) {
        const fallback = createSatiateSnapshot();
        const remainingMs = scenarioRemainingMs(parsed);
        setSnapshot({
          ...fallback,
          ...parsed,
          displayEnabled: parsed.displayEnabled !== false,
          outcome: parsed.outcome && parsed.outcome in SATIATE_OUTCOMES ? parsed.outcome : "normal-lunch",
          presentation: { ...fallback.presentation, ...(parsed.presentation ?? {}) },
          subsystems: { ...fallback.subsystems, ...(parsed.subsystems ?? {}) },
          remainingMs,
          endsAt: parsed.running && remainingMs > 0 ? Date.now() + remainingMs : null,
          running: parsed.running && remainingMs > 0,
          zeroTriggeredAt: remainingMs === 0 ? parsed.zeroTriggeredAt ?? Date.now() : null,
          revision: Date.now(),
        });
      }
      const dismissedRaw = window.localStorage.getItem(dismissedKey(room));
      const dismissedParsed = dismissedRaw ? JSON.parse(dismissedRaw) as unknown : null;
      if (Array.isArray(dismissedParsed) && dismissedParsed.every((item) => typeof item === "string")) setDismissed(dismissedParsed);
    } catch {
      // A clean 90-minute hold is the show-safe fallback for malformed storage.
    }
    setReady(true);
  }, [room]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(storageKey(room), JSON.stringify(snapshot));
      window.localStorage.setItem(dismissedKey(room), JSON.stringify(dismissed));
    } catch {
      // Realtime control remains available when storage is blocked.
    }
  }, [dismissed, ready, room, snapshot]);

  useEffect(() => {
    if (!ready) return;
    sendCommand({ type: "set-scenario", snapshot });
  }, [ready, sendCommand, snapshot]);

  useEffect(() => {
    if (!ready || displayCount === 0) return;
    sendCommand({ type: "set-scenario", snapshot });
    // Presence changes are the recovery signal for refreshed or newly joined displays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayCount, ready, sendCommand]);

  const remainingMs = scenarioRemainingMs(snapshot, now);

  const commit = useCallback((update: (current: ScenarioRuntimeSnapshot) => ScenarioRuntimeSnapshot) => {
    setSnapshot((current) => ({ ...update(current), revision: Date.now() }));
  }, []);

  const authorizedFetch = useCallback(async (endpoint: string, payload: Record<string, unknown>) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-friend-computer-gm-key": gmKey },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) throw new Error(data.error || "Scenario request failed.");
  }, [gmKey]);

  const logEvent = useCallback(async (title: string, detail: string, category = "MISSION", visibility = "COMPUTER") => {
    await authorizedFetch("/api/session-events", {
      action: "add", room, category, visibility, importance: "IMPORTANT", seat: null, title, detail,
    });
  }, [authorizedFetch, room]);

  const activateContext = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      await authorizedFetch("/api/session-context", {
        action: "save",
        room,
        status: "ACTIVE",
        missionTitle: SATIATE_SCENARIO.title,
        location: "R&D LAB 7-GAMMA",
        scene: "SATIATE-7 INVESTIGATION — UNKNOWN DEVICE COUNTDOWN",
        currentObjective: "Determine the purpose and threat posed by SATIATE-7 before its countdown reaches zero.",
        publicContext: SATIATE_SCENARIO.publicContext,
        gmGuidance: SATIATE_SCENARIO.gmGuidance,
      });
      await logEvent("90 Minutes to Treason activated", "SATIATE-7 was placed under Troubleshooter investigation. The countdown was configured but not started automatically.");
      setMessage("MISSION CONTEXT SYNCHRONIZED · TIMER REMAINS ON HOLD");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to synchronize mission context.");
    } finally {
      setBusy(false);
    }
  }, [authorizedFetch, logEvent, room]);

  const start = useCallback(() => {
    if (remainingMs <= 0) return;
    commit((current) => ({ ...current, displayEnabled: true, running: true, remainingMs, endsAt: Date.now() + remainingMs, zeroTriggeredAt: null }));
    setMessage("COUNTDOWN STARTED");
    void logEvent("SATIATE-7 countdown started", `Countdown started at ${formatScenarioTime(remainingMs)}.`).catch(() => setError("Countdown started, but logging failed."));
  }, [commit, logEvent, remainingMs]);

  const pause = useCallback(() => {
    commit((current) => {
      const captured = scenarioRemainingMs(current);
      return { ...current, running: false, remainingMs: captured, endsAt: null };
    });
    setMessage("COUNTDOWN PAUSED · MANUAL OVERRIDE ACTIVE");
  }, [commit]);

  const reset = useCallback(() => {
    const fresh = createSatiateSnapshot();
    commit(() => fresh);
    setDismissed([]);
    setManualTime("01:30:00");
    setMessage("COUNTDOWN RESET TO 01:30:00 · HOLD");
  }, [commit]);

  const adjust = useCallback((deltaMs: number) => {
    commit((current) => {
      const adjusted = Math.max(0, scenarioRemainingMs(current) + deltaMs);
      return {
        ...current,
        displayEnabled: true,
        remainingMs: adjusted,
        endsAt: current.running && adjusted > 0 ? Date.now() + adjusted : null,
        running: current.running && adjusted > 0,
        zeroTriggeredAt: adjusted > 0 ? null : Date.now(),
      };
    });
  }, [commit]);

  const setTime = useCallback(() => {
    const parsed = parseScenarioTime(manualTime);
    if (parsed === null) {
      setError("Use HH:MM:SS or MM:SS with minutes and seconds below 60.");
      return;
    }
    setError("");
    commit((current) => ({
      ...current,
      displayEnabled: true,
      remainingMs: parsed,
      endsAt: current.running && parsed > 0 ? Date.now() + parsed : null,
      running: current.running && parsed > 0,
      zeroTriggeredAt: parsed === 0 ? Date.now() : null,
    }));
    setMessage(`COUNTDOWN SET TO ${formatScenarioTime(parsed)}`);
  }, [commit, manualTime]);

  const triggerZero = useCallback((source: "GM" | "AUTOMATIC") => {
    const triggeredAt = Date.now();
    commit((current) => ({ ...current, displayEnabled: true, running: false, remainingMs: 0, endsAt: null, zeroTriggeredAt: triggeredAt }));
    setMessage(`${source} ZERO EVENT · ${SATIATE_OUTCOMES[snapshot.outcome].label}`);
    void logEvent("SATIATE-7 zero event", `${source} zero event. Selected outcome: ${SATIATE_OUTCOMES[snapshot.outcome].label}.`).catch(() => setError("Zero event triggered, but logging failed."));
  }, [commit, logEvent, snapshot.outcome]);

  useEffect(() => {
    if (!ready || !snapshot.running || snapshot.zeroTriggeredAt !== null || remainingMs > 0) return;
    triggerZero("AUTOMATIC");
  }, [ready, remainingMs, snapshot.running, snapshot.zeroTriggeredAt, triggerZero]);

  const runPreset = useCallback((preset: ScenarioPreset) => {
    commit((current) => ({ ...current, displayEnabled: true, presentation: preset.presentation }));
    sendCommand({ type: "set-expression", expression: preset.expression, intensity: preset.intensity });
    sendCommand({ type: "set-threat", level: preset.threat });
    sendCommand({ type: "set-status", text: preset.presentation.headline });
    if (preset.speak) sendCommand({ type: "speak", text: preset.speak });
    setMessage(`PRESENTATION: ${preset.label}`);
  }, [commit, sendCommand]);

  const toggleFinalSequence = useCallback(() => {
    const enabling = !snapshot.finalSequenceEnabled;
    commit((current) => ({ ...current, finalSequenceEnabled: enabling, displayEnabled: true }));
    setMessage(enabling ? "PRE-SERVICE SEQUENCE ENABLED" : "PRE-SERVICE SEQUENCE DISABLED");
    void logEvent(
      enabling ? "SATIATE-7 pre-service sequence enabled" : "SATIATE-7 pre-service sequence disabled",
      enabling ? `GM explicitly armed the final sequence at ${formatScenarioTime(remainingMs)} remaining.` : "GM manually disarmed the final sequence.",
    ).catch(() => setError("Final sequence changed, but logging failed."));
  }, [commit, logEvent, remainingMs, snapshot.finalSequenceEnabled]);

  const speakPreset = useCallback((text: string) => {
    commit((current) => ({ ...current, displayEnabled: true, presentation: { kind: "announcement", eyebrow: "FRIEND COMPUTER ANNOUNCEMENT", headline: text.toUpperCase(), detail: "SAT-7 COUNTDOWN CONTINUES" } }));
    sendCommand({ type: "set-status", text: text.toUpperCase() });
    sendCommand({ type: "speak", text });
    setMessage(primaryAudioDisplayCount > 0
      ? "TEXT-TO-SPEECH SENT TO PRIMARY AUDIO DISPLAY"
      : "TEXT-TO-SPEECH SENT · NO PRIMARY AUDIO DISPLAY DETECTED");
  }, [commit, primaryAudioDisplayCount, sendCommand]);

  const dueReminders = useMemo(
    () => SATIATE_REMINDERS.filter((reminder) => remainingMs <= reminder.atMs && !dismissed.includes(reminder.id)),
    [dismissed, remainingMs],
  );

  const cycleSubsystem = useCallback((name: SatiateSubsystem) => {
    commit((current) => {
      const currentIndex = SUBSYSTEM_STATES.indexOf(current.subsystems[name]);
      const next = SUBSYSTEM_STATES[(currentIndex + 1) % SUBSYSTEM_STATES.length];
      return { ...current, subsystems: { ...current.subsystems, [name]: next } };
    });
  }, [commit]);

  const logSatiateState = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const subsystemDetail = SATIATE_SUBSYSTEMS.map((name) => `${name}: ${snapshot.subsystems[name]}`).join("; ");
      await logEvent("SATIATE-7 status recorded", `${subsystemDetail}.${notes.trim() ? ` GM note: ${notes.trim()}` : ""}`, "EQUIPMENT", "GM_ONLY");
      setNotes("");
      setMessage("SATIATE-7 STATE RECORDED FOR DEBRIEF");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to record SATIATE-7 state.");
    } finally {
      setBusy(false);
    }
  }, [logEvent, notes, snapshot.subsystems]);

  const activeReminder = dueReminders[0];

  return (
    <>
      <section className="panel scenario-director-hero">
        <div className="panel-heading"><span>90</span><h2>SATIATE-7 Countdown Control</h2></div>
        <div className="scenario-director-clock">{formatScenarioTime(remainingMs)}</div>
        <div className="scenario-director-state">{snapshot.running ? "● RUNNING IN REAL TIME" : snapshot.zeroTriggeredAt ? "ZERO EVENT ACTIVE" : "Ⅱ HOLD · GM CONTROL"}</div>
        <div className="scenario-control-grid">
          <button type="button" className="primary-action" disabled={snapshot.running || remainingMs <= 0} onClick={start}>{snapshot.running ? "RUNNING" : "START / RESUME"}</button>
          <button type="button" disabled={!snapshot.running} onClick={pause}>PAUSE</button>
          <button type="button" onClick={reset}>RESET 90:00</button>
          <button type="button" onClick={() => adjust(5 * 60_000)}>+ 5 MIN</button>
          <button type="button" onClick={() => adjust(-5 * 60_000)}>− 5 MIN</button>
          <button type="button" className="danger" onClick={() => triggerZero("GM")}>TRIGGER ZERO</button>
        </div>
        <div className="scenario-manual-time">
          <input aria-label="Manual countdown time" value={manualTime} onChange={(event) => setManualTime(event.target.value)} placeholder="HH:MM:SS" />
          <button type="button" onClick={setTime}>SET TIME</button>
          <button type="button" onClick={() => commit((current) => ({ ...current, displayEnabled: true }))}>SHOW SCENARIO</button>
          <button type="button" onClick={() => commit((current) => ({ ...current, displayEnabled: false }))}>RETURN TO FRIEND COMPUTER</button>
        </div>
        <button type="button" disabled={busy} onClick={() => void activateContext()}>{busy ? "SYNCHRONIZING…" : "SYNC MISSION CONTEXT + LOG ACTIVATION"}</button>
        {message ? <div className="scenario-feedback">{message}</div> : null}
        {error ? <div className="scenario-feedback scenario-feedback--error">{error}</div> : null}
      </section>

      <section className="panel scenario-reminder-panel">
        <div className="panel-heading"><span>GM</span><h2>Director Reminder</h2></div>
        {activeReminder ? (
          <div className="scenario-reminder">
            <strong>{activeReminder.label}</strong>
            <p>{activeReminder.detail}</p>
            <small>{dueReminders.length > 1 ? `${dueReminders.length - 1} additional crossed reminder(s) queued. ` : ""}GM ONLY · never sent automatically.</small>
            <button type="button" onClick={() => setDismissed((current) => [...current, activeReminder.id])}>DISMISS / SKIP</button>
          </div>
        ) : <p className="scenario-muted">No milestone reminder is currently due.</p>}
      </section>

      <section className="panel scenario-final-panel">
        <div className="panel-heading"><span>10</span><h2>Final Sequence + Ending</h2></div>
        <button type="button" className={snapshot.finalSequenceEnabled ? "is-active" : "danger"} onClick={toggleFinalSequence}>
          {snapshot.finalSequenceEnabled ? "FINAL SEQUENCE ENABLED · DISABLE" : "ENABLE FINAL SEQUENCE"}
        </button>
        <select value={snapshot.outcome} onChange={(event) => commit((current) => ({ ...current, outcome: event.target.value as SatiateOutcome }))}>
          {Object.entries(SATIATE_OUTCOMES).map(([id, outcome]) => <option key={id} value={id}>{outcome.label}</option>)}
        </select>
        <div className="button-row">
          <button type="button" onClick={() => commit((current) => ({ ...current, zeroTriggeredAt: Date.now(), displayEnabled: true }))}>REPLAY REVEAL</button>
          <button type="button" onClick={() => commit((current) => ({ ...current, displayEnabled: false }))}>EXIT REVEAL</button>
        </div>
        <small className="scenario-muted">Final progression is automatic only after explicit arming. The selected ending is used at zero.</small>
      </section>

      <section className="panel scenario-wide-panel">
        <div className="panel-heading"><span>FX</span><h2>Projector Presentation States</h2></div>
        <div className="scenario-preset-grid">{SATIATE_PRESETS.map((preset) => <button type="button" key={preset.id} className={preset.presentation.kind === "alert" ? "danger" : ""} onClick={() => runPreset(preset)}>{preset.label}</button>)}</div>
      </section>

      <section className="panel scenario-wide-panel">
        <div className="panel-heading"><span>FC</span><h2>Scenario Message Presets · Text to Speech</h2></div>
        <small className="scenario-muted">
          {primaryAudioDisplayCount > 0
            ? `● PRIMARY AUDIO READY (${primaryAudioDisplayCount}) · Each preset appears on screen and is spoken aloud.`
            : "× NO PRIMARY AUDIO DISPLAY · On the Friend Computer display, press M and choose PRIMARY AUDIO to hear these presets."}
        </small>
        <div className="scenario-message-grid">{SATIATE_MESSAGE_PRESETS.map((text) => <button type="button" key={text} title={`Speak: ${text}`} onClick={() => speakPreset(text)}>{text}</button>)}</div>
      </section>

      <section className="panel scenario-wide-panel">
        <div className="panel-heading"><span>SYS</span><h2>SATIATE Subsystems + Debrief Memory</h2></div>
        <div className="scenario-subsystem-grid">{SATIATE_SUBSYSTEMS.map((name) => <button type="button" key={name} className={`scenario-subsystem scenario-subsystem--${snapshot.subsystems[name].toLowerCase()}`} onClick={() => cycleSubsystem(name)}><span>{name}</span><strong>{snapshot.subsystems[name]}</strong></button>)}</div>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Record modifications, accusations, final assessments, or who authorized the dangerous idea…" />
        <button type="button" className="primary-action" disabled={busy} onClick={() => void logSatiateState()}>LOG SATIATE STATE + NOTE</button>
      </section>
    </>
  );
}
