"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PLAYER_PRESETS } from "@/lib/friend-computer";
import { useGmSession } from "@/lib/gm-session";
import {
  CONTROL_PLAYER_NAMES_STORAGE_KEY,
  createGmHandoffPackage,
  downloadGmHandoffPackage,
  handoffConfigurationKey,
  parseGmHandoffPackageText,
  toRehearsalSession,
  type GmHandoffPackage,
  type HandoffRosterEntry,
  type HandoffSpeechPreset,
  type StoredHandoffConfiguration,
} from "@/lib/gm-handoff";
import {
  BUILT_IN_MISSION_PACKAGES,
  type DirectorMissionPackage,
  type SceneMissionPackageFile,
} from "@/lib/mission-package-format";
import {
  loadImportedMissions,
  missionWorkshopDraftKey,
  storeImportedMissions,
} from "@/lib/mission-library";
import { STANDARD_PROJECTOR_PRESETS } from "@/lib/projector-presets";
import { readRehearsalSession, writeRehearsalSession } from "@/lib/rehearsal";
import { SATIATE_MESSAGE_PRESETS } from "@/lib/scenarios";

const MAX_PACKAGE_TEXT = 2_000_000;
const CLEARANCES = ["INFRARED", "RED", "ORANGE", "YELLOW", "GREEN", "BLUE", "INDIGO", "VIOLET", "ULTRAVIOLET"] as const;

function normalizeRoom(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "alpha";
}

function defaultRoster() {
  let labels: string[] = PLAYER_PRESETS.map((preset) => preset.label);
  try {
    const value = JSON.parse(window.localStorage.getItem(CONTROL_PLAYER_NAMES_STORAGE_KEY) ?? "null") as unknown;
    if (Array.isArray(value) && value.length === PLAYER_PRESETS.length && value.every((item) => typeof item === "string")) labels = value;
  } catch {
    // The physical-seat defaults remain valid if storage is unavailable.
  }
  return labels.map((displayName, index) => ({ seat: index + 1, displayName: displayName.trim() || `Citizen ${index + 1}` }));
}

function speechPresetsForMission(mission: DirectorMissionPackage): HandoffSpeechPreset[] {
  if (mission.director.type === "countdown") {
    return SATIATE_MESSAGE_PRESETS.map((text, index) => ({ id: `satiate-message-${index + 1}`, label: `SATIATE-7 MESSAGE ${index + 1}`, text }));
  }
  return mission.director.scenes.flatMap((scene) => scene.cues.flatMap((cue) => cue.commands
    .filter((command): command is Extract<(typeof cue.commands)[number], { type: "speak" }> => command.type === "speak")
    .map((command, index) => ({ id: `${scene.id}-${cue.id}-${index + 1}`, label: cue.label, text: command.text })))).slice(0, 100);
}

function handoutsForMission(mission: DirectorMissionPackage) {
  if (mission.director.type === "countdown") return [];
  return mission.director.scenes.flatMap((scene) => scene.handouts.map((name) => ({ sceneId: scene.id, sceneTitle: scene.title, name })));
}

function isSceneMission(mission: DirectorMissionPackage): mission is SceneMissionPackageFile {
  return mission.director.type === "scenes";
}

function rowString(row: Record<string, unknown> | undefined, key: string) {
  return typeof row?.[key] === "string" ? String(row[key]) : "";
}

function rowNumber(row: Record<string, unknown> | undefined, key: string, fallback: number) {
  const value = Number(row?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

export function GmHandoffPanel({ room }: { room: string }) {
  const { gmKey, setGmKey, rememberGmKey, sessionReady, restoredFromSession } = useGmSession();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [missions, setMissions] = useState<DirectorMissionPackage[]>(BUILT_IN_MISSION_PACKAGES);
  const [selectedMissionId, setSelectedMissionId] = useState(BUILT_IN_MISSION_PACKAGES[0].id);
  const [roster, setRoster] = useState<HandoffRosterEntry[]>([]);
  const [displayCount, setDisplayCount] = useState("1");
  const [audioPolicy, setAudioPolicy] = useState<"one-primary" | "visual-only">("one-primary");
  const [displayNote, setDisplayNote] = useState("Use one projector display as PRIMARY AUDIO and keep every other display VISUAL ONLY.");
  const [handoffNotes, setHandoffNotes] = useState("");
  const [bundle, setBundle] = useState<GmHandoffPackage | null>(null);
  const [packageText, setPackageText] = useState("");
  const [review, setReview] = useState<GmHandoffPackage | null>(null);
  const [targetRoom, setTargetRoom] = useState(`${normalizeRoom(room)}-copy`);
  const [includeMission, setIncludeMission] = useState(true);
  const [includeRoster, setIncludeRoster] = useState(true);
  const [writeServerRoster, setWriteServerRoster] = useState(true);
  const [includeConfiguration, setIncludeConfiguration] = useState(true);
  const [includeRehearsal, setIncludeRehearsal] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("HANDOFF CONSOLE READY · NOTHING EXPORTED OR IMPORTED");
  const [error, setError] = useState("");
  const [appliedTarget, setAppliedTarget] = useState("");
  const [targetDraftExists, setTargetDraftExists] = useState(false);

  const selectedMission = missions.find((mission) => mission.id === selectedMissionId) ?? missions[0];
  const importedMissionConflict = Boolean(review?.payload.mission.director.type === "scenes"
    && missions.some((mission) => mission.id === review.payload.mission.id && !BUILT_IN_MISSION_PACKAGES.some((builtIn) => builtIn.id === mission.id)));
  const packageReady = Boolean(review);
  const serverRosterRequiresKey = includeRoster && writeServerRoster && Boolean(review?.payload.roster.length);
  const applyDisabled = busy || !packageReady || (!includeMission && !includeRoster && !includeConfiguration && !includeRehearsal) || (serverRosterRequiresKey && !gmKey.trim());

  useEffect(() => {
    let imported: SceneMissionPackageFile[] = [];
    try {
      imported = loadImportedMissions();
    } catch {
      setStatus("CUSTOM MISSION LIBRARY COULD NOT BE READ · BUILT-IN MISSIONS AVAILABLE");
    }
    const merged = new Map<string, DirectorMissionPackage>();
    for (const mission of BUILT_IN_MISSION_PACKAGES) merged.set(mission.id, mission);
    for (const mission of imported) if (!merged.has(mission.id)) merged.set(mission.id, mission);
    setMissions([...merged.values()]);
    setRoster(defaultRoster());
  }, []);

  useEffect(() => {
    setBundle(null);
  }, [audioPolicy, displayCount, displayNote, handoffNotes, roster, selectedMissionId]);

  useEffect(() => {
    if (!review) return;
    try {
      setTargetDraftExists(Boolean(window.localStorage.getItem(missionWorkshopDraftKey(normalizeRoom(targetRoom)))));
    } catch {
      setTargetDraftExists(false);
    }
  }, [review, targetRoom]);

  const rosterRequest = useCallback(async (target: string, payload: Record<string, unknown>) => {
    const response = await fetch("/api/roster", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-friend-computer-gm-key": gmKey },
      body: JSON.stringify({ ...payload, room: target }),
      cache: "no-store",
    });
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Citizen directory request failed.");
    return data;
  }, [gmKey]);

  const loadSafeRoster = useCallback(async () => {
    if (!gmKey.trim()) {
      setError("Enter the GM passphrase to load safe seat names from Citizen Communications.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await rosterRequest(room, { action: "list" });
      const rows = Array.isArray(data.citizens) ? data.citizens as Array<Record<string, unknown>> : [];
      const safe = rows.map((row) => ({ seat: Number(row.seat), displayName: rowString(row, "display_name") }))
        .filter((entry) => Number.isInteger(entry.seat) && entry.seat >= 1 && entry.seat <= 16 && entry.displayName)
        .sort((a, b) => a.seat - b.seat);
      setRoster(safe.length ? safe : defaultRoster());
      rememberGmKey();
      setStatus(`${safe.length} SAFE SEAT LABEL${safe.length === 1 ? "" : "S"} LOADED · EMAILS AND PRIVATE FIELDS EXCLUDED`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load the room roster.");
    } finally {
      setBusy(false);
    }
  }, [gmKey, rememberGmKey, room, rosterRequest]);

  const createBundle = useCallback(async () => {
    setBusy(true);
    setError("");
    setAppliedTarget("");
    try {
      const rehearsal = readRehearsalSession(room);
      const packageValue = await createGmHandoffPackage({
        sourceRoom: normalizeRoom(room),
        mission: selectedMission,
        roster,
        presets: {
          projector: STANDARD_PROJECTOR_PRESETS.map((preset) => ({ ...preset })),
          speech: speechPresetsForMission(selectedMission),
        },
        display: {
          expectedDisplayCount: Math.max(1, Math.min(12, Number(displayCount) || 1)),
          audioPolicy,
          note: displayNote,
        },
        handouts: handoutsForMission(selectedMission),
        rehearsal: rehearsal && rehearsal.missionId === selectedMission.id ? {
          missionId: rehearsal.missionId,
          activeSceneId: rehearsal.activeSceneId,
          testedIds: rehearsal.testedIds,
          completedSceneIds: rehearsal.completedSceneIds,
          updatedAt: rehearsal.updatedAt,
        } : null,
        notes: handoffNotes.split("\n").map((note) => note.trim()).filter(Boolean),
      });
      const text = `${JSON.stringify(packageValue, null, 2)}\n`;
      setBundle(packageValue);
      setPackageText(text);
      setReview(null);
      setStatus(`${selectedMission.title} PACKAGED · SHA-256 VERIFIED MANIFEST READY`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create the handoff package.");
    } finally {
      setBusy(false);
    }
  }, [audioPolicy, displayCount, displayNote, handoffNotes, room, roster, selectedMission]);

  const copyBundle = useCallback(async () => {
    if (!bundle) return;
    try {
      await navigator.clipboard.writeText(`${JSON.stringify(bundle, null, 2)}\n`);
      setStatus("HANDOFF JSON COPIED · READY TO SEND SECURELY");
    } catch {
      setError("This browser blocked clipboard access. Use DOWNLOAD PACKAGE instead.");
    }
  }, [bundle]);

  const validatePackage = useCallback(async (text = packageText) => {
    setBusy(true);
    setError("");
    setAppliedTarget("");
    try {
      const parsed = await parseGmHandoffPackageText(text);
      setReview(parsed);
      setTargetRoom(`${normalizeRoom(room)}-copy`);
      setIncludeMission(true);
      setIncludeRoster(parsed.payload.roster.length > 0);
      setWriteServerRoster(parsed.payload.roster.length > 0);
      setIncludeConfiguration(true);
      setIncludeRehearsal(Boolean(parsed.payload.rehearsal));
      setStatus(`PACKAGE VERIFIED · ${parsed.payload.mission.title} READY FOR SELECTIVE IMPORT`);
    } catch (reason) {
      setReview(null);
      setError(reason instanceof Error ? reason.message : "Unable to validate the handoff package.");
    } finally {
      setBusy(false);
    }
  }, [packageText, room]);

  const loadPackageFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (!file.name.toLowerCase().endsWith(".json")) {
      setError("GM handoff packages must be JSON files.");
      return;
    }
    if (file.size > MAX_PACKAGE_TEXT) {
      setError("This handoff package is larger than the 2 MB safety limit.");
      return;
    }
    try {
      const text = await file.text();
      setPackageText(text);
      await validatePackage(text);
    } catch (reason) {
      setReview(null);
      setError(reason instanceof Error ? reason.message : "Unable to read the selected handoff package.");
    }
  }, [validatePackage]);

  const applyRosterToServer = useCallback(async (target: string, safeRoster: HandoffRosterEntry[]) => {
    const currentData = await rosterRequest(target, { action: "list" });
    const currentRows = Array.isArray(currentData.citizens) ? currentData.citizens as Array<Record<string, unknown>> : [];
    for (const entry of safeRoster) {
      const existing = currentRows.find((row) => Number(row.seat) === entry.seat);
      const existingClearance = rowString(existing, "clearance").toUpperCase();
      const clearance = CLEARANCES.includes(existingClearance as (typeof CLEARANCES)[number]) ? existingClearance : "RED";
      await rosterRequest(target, {
        action: "upsert",
        citizen: {
          seat: entry.seat,
          citizenId: rowString(existing, "citizen_id") || `CITIZEN-${entry.seat}-R-${target.toUpperCase().slice(0, 16)}-1`,
          displayName: entry.displayName,
          clearance,
          cloneNumber: Math.max(1, rowNumber(existing, "clone_number", 1)),
          email: rowString(existing, "email"),
          secretSociety: rowString(existing, "secret_society"),
          serviceGroup: rowString(existing, "service_group"),
          firm: rowString(existing, "firm"),
          mbd: rowString(existing, "mbd"),
          perversityPoints: Math.max(0, rowNumber(existing, "perversity_points", 25)),
          officialCommendations: Math.max(0, rowNumber(existing, "official_commendations", 0)),
          officialReprimands: Math.max(0, rowNumber(existing, "official_reprimands", 0)),
        },
      });
    }
  }, [rosterRequest]);

  const applyPackage = useCallback(async () => {
    if (!review) return;
    const target = normalizeRoom(targetRoom);
    if (targetDraftExists && includeMission && !window.confirm(`Room ${target.toUpperCase()} already has a Mission Workshop draft. Replace that draft with this handoff mission?`)) return;
    if (importedMissionConflict && includeMission && !window.confirm(`A custom mission named ${review.payload.mission.id} already exists in this browser. Replace it with the verified handoff copy?`)) return;
    setBusy(true);
    setError("");
    setAppliedTarget("");
    try {
      const payload = review.payload;
      const mission = payload.mission;
      if (includeMission && isSceneMission(mission)) {
        const imported = loadImportedMissions();
        const builtIn = BUILT_IN_MISSION_PACKAGES.some((builtInMission) => builtInMission.id === mission.id);
        if (!builtIn) storeImportedMissions([...imported.filter((importedMission) => importedMission.id !== mission.id), mission]);
        window.localStorage.setItem(missionWorkshopDraftKey(target), JSON.stringify(mission));
      }
      if (includeRoster && payload.roster.length) {
        const labels: string[] = PLAYER_PRESETS.map((preset) => preset.label);
        for (const entry of payload.roster) if (entry.seat <= labels.length) labels[entry.seat - 1] = entry.displayName;
        window.localStorage.setItem(CONTROL_PLAYER_NAMES_STORAGE_KEY, JSON.stringify(labels));
        if (writeServerRoster) {
          await applyRosterToServer(target, payload.roster);
          rememberGmKey();
        }
      }
      if (includeConfiguration) {
        const stored: StoredHandoffConfiguration = {
          version: 1,
          importedAt: Date.now(),
          sourceRoom: payload.sourceRoom,
          missionId: payload.mission.id,
          presets: payload.presets,
          display: payload.display,
          handouts: payload.handouts,
          notes: payload.notes,
        };
        window.localStorage.setItem(handoffConfigurationKey(target), JSON.stringify(stored));
      }
      if (includeRehearsal && payload.rehearsal) writeRehearsalSession(target, toRehearsalSession(payload.rehearsal));
      window.localStorage.setItem("friend-computer-room", target);
      setAppliedTarget(target);
      setStatus(`HANDOFF APPLIED TO ROOM ${target.toUpperCase()} · LIVE SESSION NOT STARTED`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to apply the handoff package.");
    } finally {
      setBusy(false);
    }
  }, [applyRosterToServer, importedMissionConflict, includeConfiguration, includeMission, includeRehearsal, includeRoster, rememberGmKey, review, targetDraftExists, targetRoom, writeServerRoster]);

  const checksumLabel = review?.checksum.value.slice(0, 12).toUpperCase() ?? bundle?.checksum.value.slice(0, 12).toUpperCase() ?? "—";

  return (
    <main className="control-shell handoff-shell">
      <header className="control-header handoff-header">
        <div>
          <span className="control-eyebrow">VERSIONED PORTABLE OPERATIONS · CREDENTIAL-SAFE</span>
          <h1>GM Handoff Package</h1>
          <p>Move a mission and its safe game-running setup to another browser without exporting credentials or private communications.</p>
        </div>
        <div className="control-header-actions">
          <Link className="display-link" href={`/workshop/${encodeURIComponent(room)}`}>MISSION WORKSHOP</Link>
          <Link className="display-link" href={`/rehearsal/${encodeURIComponent(room)}`}>REHEARSAL</Link>
        </div>
      </header>

      <section className="handoff-safety" role="note">
        <strong>EXPORT BOUNDARY</strong>
        <span>Mission GM guidance is included intentionally. GM passphrases, player email addresses, Secret Society fields, messages, notices, session logs, and device identifiers are never included.</span>
      </section>

      <div className="handoff-layout">
        <section className="panel handoff-builder">
          <div className="panel-heading"><span>OUT</span><h2>Create Handoff</h2></div>
          <p className="handoff-muted">Choose the mission and recommendations your partner should receive.</p>

          <label className="handoff-field"><span>MISSION</span><select value={selectedMissionId} onChange={(event) => { setSelectedMissionId(event.target.value); setBundle(null); }}>{missions.map((mission) => <option value={mission.id} key={mission.id}>{mission.title}</option>)}</select></label>

          <div className="handoff-roster-block">
            <div><span>SAFE ROSTER</span><strong>{roster.length} SEAT LABEL{roster.length === 1 ? "" : "S"}</strong></div>
            <button type="button" disabled={busy || !gmKey.trim()} onClick={() => void loadSafeRoster()}>LOAD ROOM ROSTER</button>
          </div>
          <details className="handoff-roster-preview"><summary>PREVIEW EXPORTED SEAT NAMES</summary>{roster.map((entry) => <div key={entry.seat}><span>SEAT {entry.seat}</span><strong>{entry.displayName}</strong></div>)}</details>

          <div className="handoff-form-grid">
            <label className="handoff-field"><span>EXPECTED DISPLAYS</span><input type="number" min="1" max="12" value={displayCount} onChange={(event) => setDisplayCount(event.target.value)} /></label>
            <label className="handoff-field"><span>AUDIO POLICY</span><select value={audioPolicy} onChange={(event) => setAudioPolicy(event.target.value as typeof audioPolicy)}><option value="one-primary">ONE PRIMARY AUDIO</option><option value="visual-only">VISUAL ONLY</option></select></label>
          </div>
          <label className="handoff-field"><span>DISPLAY / AUDIO RECOMMENDATION</span><textarea value={displayNote} onChange={(event) => setDisplayNote(event.target.value)} /></label>
          <label className="handoff-field"><span>REHEARSAL, PREFLIGHT, OR PARTNER NOTES · ONE PER LINE</span><textarea value={handoffNotes} onChange={(event) => setHandoffNotes(event.target.value)} placeholder="Confirm projector is fullscreen\nPrint LIFT-44 handout\nUse the kitchen laptop as primary audio" /></label>

          <label className="handoff-field"><span>GM AUTHORIZATION · ONLY USED TO READ SAFE ROOM ROSTER LABELS</span><input type="password" value={gmKey} disabled={!sessionReady} onChange={(event) => setGmKey(event.target.value)} placeholder="Optional for package creation" autoComplete="off" /></label>
          <small className="handoff-muted">{restoredFromSession ? "GM authorization restored for this browser session. It will not enter the package." : "The default package uses the four local Citizen Targeting labels until you load the room roster."}</small>

          <div className="handoff-actions">
            <button type="button" className="primary-action" disabled={busy} onClick={() => void createBundle()}>{busy ? "PROCESSING…" : "CREATE VERIFIED PACKAGE"}</button>
            <button type="button" disabled={!bundle} onClick={() => bundle ? downloadGmHandoffPackage(bundle) : undefined}>DOWNLOAD PACKAGE</button>
            <button type="button" disabled={!bundle} onClick={() => void copyBundle()}>COPY JSON</button>
          </div>
          {bundle ? <div className="handoff-manifest"><span>MANIFEST V{bundle.version}</span><strong>{bundle.payload.mission.title}</strong><small>SHA-256 {checksumLabel}… · {bundle.payload.roster.length} seats · {bundle.payload.handouts.length} handouts · {bundle.payload.presets.speech.length} speech cues</small></div> : null}
        </section>

        <section className="panel handoff-receiver">
          <div className="panel-heading"><span>IN</span><h2>Receive Handoff</h2></div>
          <p className="handoff-muted">Load or paste a package. Nothing changes until the checksum passes and you approve each import category.</p>
          <input ref={fileInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void loadPackageFile(event.target.files?.[0])} />
          <div className="handoff-actions handoff-actions--receive">
            <button type="button" onClick={() => fileInputRef.current?.click()}>LOAD .JSON PACKAGE</button>
            <button type="button" disabled={busy || !packageText.trim()} onClick={() => void validatePackage()}>{busy ? "VERIFYING…" : "VERIFY PASTED PACKAGE"}</button>
          </div>
          <label className="handoff-field"><span>PACKAGE JSON</span><textarea className="handoff-package-text" value={packageText} maxLength={MAX_PACKAGE_TEXT} onChange={(event) => { setPackageText(event.target.value); setReview(null); }} placeholder="Paste a friend-computer-gm-handoff JSON package here…" /></label>

          {review ? (
            <div className="handoff-review">
              <div className="handoff-verified"><span>✓ SHA-256 VERIFIED</span><strong>{review.payload.mission.title}</strong><small>Created {new Date(review.createdAt).toLocaleString()} · source room {review.payload.sourceRoom.toUpperCase()} · checksum {checksumLabel}…</small></div>

              <div className="handoff-summary-grid">
                <div><span>MISSION</span><strong>{review.payload.mission.director.type === "scenes" ? `${review.payload.mission.director.scenes.length} SCENES` : "SATIATE-7 COUNTDOWN"}</strong></div>
                <div><span>ROSTER</span><strong>{review.payload.roster.length} SEATS</strong></div>
                <div><span>PRESETS</span><strong>{review.payload.presets.projector.length + review.payload.presets.speech.length}</strong></div>
                <div><span>HANDOUTS</span><strong>{review.payload.handouts.length}</strong></div>
              </div>

              <div className="handoff-selective">
                <label><input type="checkbox" checked={includeMission} onChange={(event) => setIncludeMission(event.target.checked)} /> <span><strong>MISSION + WORKSHOP DRAFT</strong><small>{importedMissionConflict ? "Replaces the existing custom mission after confirmation." : "Adds the mission locally and prepares it in the target Workshop."}</small></span></label>
                <label><input type="checkbox" checked={includeRoster} disabled={!review.payload.roster.length} onChange={(event) => setIncludeRoster(event.target.checked)} /> <span><strong>ROSTER + TARGETING LABELS</strong><small>Only seat numbers and display names are present.</small></span></label>
                {includeRoster && review.payload.roster.length ? <label className="handoff-nested"><input type="checkbox" checked={writeServerRoster} onChange={(event) => setWriteServerRoster(event.target.checked)} /> <span><strong>WRITE SAFE NAMES TO TARGET COMMUNICATIONS DIRECTORY</strong><small>Existing emails, Secret Society fields, status, and character details are preserved.</small></span></label> : null}
                <label><input type="checkbox" checked={includeConfiguration} onChange={(event) => setIncludeConfiguration(event.target.checked)} /> <span><strong>PRESETS, DISPLAY PLAN, HANDOUT MANIFEST + NOTES</strong><small>Stores the receiving GM&apos;s room-scoped operations reference.</small></span></label>
                <label><input type="checkbox" checked={includeRehearsal} disabled={!review.payload.rehearsal} onChange={(event) => setIncludeRehearsal(event.target.checked)} /> <span><strong>REHEARSAL PROGRESS</strong><small>{review.payload.rehearsal ? `${review.payload.rehearsal.testedIds.length} tested items; restored paused.` : "No matching rehearsal state was included."}</small></span></label>
              </div>

              <label className="handoff-field"><span>TARGET ROOM CODE</span><input value={targetRoom} onChange={(event) => setTargetRoom(event.target.value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 48))} /></label>
              <div className="handoff-target-preview">
                <span>IMPORT TARGET</span><strong>ROOM {normalizeRoom(targetRoom).toUpperCase()}</strong><small>{targetDraftExists && includeMission ? "Existing Workshop draft will require replacement confirmation." : "Live mission state, messages, notices, and logs will not be changed."}</small>
              </div>
              {serverRosterRequiresKey ? <label className="handoff-field"><span>GM AUTHORIZATION · USED ONLY TO CREATE OR UPDATE THE TARGET ROOM</span><input type="password" value={gmKey} disabled={!sessionReady} onChange={(event) => setGmKey(event.target.value)} placeholder="Required for target Communications roster" autoComplete="off" /></label> : null}
              <button type="button" className="primary-action handoff-apply" disabled={applyDisabled} onClick={() => void applyPackage()}>{busy ? "APPLYING VERIFIED PACKAGE…" : `APPLY SELECTED ITEMS TO ${normalizeRoom(targetRoom).toUpperCase()}`}</button>
            </div>
          ) : null}
        </section>
      </div>

      {appliedTarget ? (
        <section className="panel handoff-complete" role="status">
          <div><span>HANDOFF COMPLETE</span><strong>ROOM {appliedTarget.toUpperCase()} IS PREPARED</strong><small>The live game has not started. Review the mission, rehearse, and run Show Readiness before play.</small></div>
          <div><Link className="primary-action" href={`/workshop/${encodeURIComponent(appliedTarget)}`}>OPEN WORKSHOP</Link><Link href={`/rehearsal/${encodeURIComponent(appliedTarget)}`}>OPEN REHEARSAL</Link><Link href={`/readiness/${encodeURIComponent(appliedTarget)}`}>SHOW READINESS</Link></div>
        </section>
      ) : null}
      {error ? <div className="handoff-error" role="alert">{error}</div> : null}
      <div className="handoff-status" role="status">{status}</div>
    </main>
  );
}
