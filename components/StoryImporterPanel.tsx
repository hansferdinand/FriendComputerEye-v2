"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGmSession } from "@/lib/gm-session";
import { missionWorkshopDraftKey } from "@/lib/mission-library";
import type { MissionCue, MissionScene } from "@/lib/mission-package";
import type { SceneMissionPackageFile } from "@/lib/mission-package-format";
import { createLocalStoryImport, type StoryImportPlan } from "@/lib/story-import";

const MAX_SOURCE_LENGTH = 60_000;

type ImportMode = "mission" | "scene" | "cue";

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function commandLabel(cue: MissionCue) {
  return cue.commands.map((command) => {
    if (command.type === "speak") return "SPEECH";
    if (command.type === "set-status") return "STATUS";
    if (command.type === "set-expression") return `EXPRESSION: ${command.expression.toUpperCase()}`;
    if (command.type === "set-threat") return `THREAT: ${command.level}`;
    if (command.type === "set-gaze") return "GAZE";
    if (command.type === "set-patrol") return "PATROL";
    if (command.type === "effect") return `EFFECT: ${command.effect.toUpperCase()}`;
    return command.type.toUpperCase();
  }).join(" · ");
}

export function StoryImporterPanel({ room }: { room: string }) {
  const router = useRouter();
  const { gmKey, setGmKey, rememberGmKey, sessionReady, restoredFromSession } = useGmSession();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [sourceText, setSourceText] = useState("");
  const [sourceName, setSourceName] = useState("PASTED STORY");
  const [titleHint, setTitleHint] = useState("");
  const [sceneCountHint, setSceneCountHint] = useState("");
  const [toneNotes, setToneNotes] = useState("");
  const [plan, setPlan] = useState<StoryImportPlan | null>(null);
  const [approvedSceneIds, setApprovedSceneIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [statusMessage, setStatusMessage] = useState("SOURCE INTAKE READY · NOTHING SAVED TO THE MISSION LIBRARY");
  const [error, setError] = useState("");

  const sourceReady = sourceText.trim().length >= 80;
  const mission = plan?.mission ?? null;
  const approvedCount = mission?.director.scenes.filter((scene) => approvedSceneIds.includes(scene.id)).length ?? 0;
  const allScenesApproved = Boolean(mission && mission.director.scenes.length > 0 && approvedCount === mission.director.scenes.length);
  const remainingSceneCount = mission ? mission.director.scenes.length - approvedCount : 0;
  const sourceStats = useMemo(() => {
    const words = sourceText.trim() ? sourceText.trim().split(/\s+/).length : 0;
    return `${sourceText.length.toLocaleString()} CHARACTERS · ${words.toLocaleString()} WORDS`;
  }, [sourceText]);

  const loadFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError("");
    const extension = file.name.toLowerCase().split(".").pop();
    if (extension !== "txt" && extension !== "md") {
      setError("This importer currently accepts only .txt and .md files. DOCX and PDF extraction are planned after layout verification.");
      return;
    }
    try {
      const text = (await file.text()).replace(/\u0000/g, "").slice(0, MAX_SOURCE_LENGTH);
      if (text.trim().length < 80) throw new Error("The selected file does not contain enough story text to import.");
      setSourceText(text);
      setSourceName(file.name.toUpperCase());
      setPlan(null);
      setApprovedSceneIds([]);
      setStatusMessage(`${file.name} LOADED · SOURCE IS HELD ONLY IN THIS BROWSER TAB UNTIL ANALYSIS`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to read the selected story file.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  const createLocalOutline = useCallback((mode: ImportMode = "mission", sceneIndex?: number, cueIndex?: number) => {
    setError("");
    try {
      const next = createLocalStoryImport(sourceText, { titleHint, sceneCountHint });
      if (mode === "mission" || !plan) {
        setPlan(next);
        setApprovedSceneIds([]);
        setStatusMessage("LOCAL REVIEW DRAFT CREATED · NO AI USED · NOTHING SAVED TO THE LIBRARY");
        return;
      }
      const targetScene = next.mission.director.scenes[Math.min(sceneIndex ?? 0, next.mission.director.scenes.length - 1)];
      if (!targetScene) throw new Error("The local outline could not regenerate that scene.");
      if (mode === "scene") {
        const scenes = plan.mission.director.scenes.map((scene, index) => index === sceneIndex ? targetScene : scene);
        setPlan({ ...plan, mission: { ...plan.mission, director: { type: "scenes", scenes } }, method: "local" });
        setApprovedSceneIds((current) => current.filter((id) => id !== plan.mission.director.scenes[sceneIndex ?? 0]?.id));
        setStatusMessage(`SCENE ${(sceneIndex ?? 0) + 1} RE-PARSED LOCALLY · OTHER SCENES PRESERVED`);
        return;
      }
      const targetCue = targetScene.cues[Math.min(cueIndex ?? 0, Math.max(0, targetScene.cues.length - 1))];
      if (!targetCue) throw new Error("No matching marked Friend Computer dialogue was found for local cue regeneration. Edit the cue in Mission Workshop or use AI regeneration.");
      const currentScene = plan.mission.director.scenes[sceneIndex ?? 0];
      const cues = currentScene.cues.map((cue, index) => index === cueIndex ? targetCue : cue);
      const scenes = plan.mission.director.scenes.map((scene, index) => index === sceneIndex ? { ...scene, cues } : scene);
      setPlan({ ...plan, mission: { ...plan.mission, director: { type: "scenes", scenes } }, method: "local" });
      setApprovedSceneIds((current) => current.filter((id) => id !== currentScene.id));
      setStatusMessage(`CUE ${(cueIndex ?? 0) + 1} RE-PARSED LOCALLY · OTHER CUES AND SCENES PRESERVED`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create a local story outline.");
    }
  }, [plan, sceneCountHint, sourceText, titleHint]);

  const requestAiDraft = useCallback(async (mode: ImportMode = "mission", sceneIndex?: number, cueIndex?: number) => {
    if (!sourceReady || !gmKey.trim() || busy) return;
    setBusy(true);
    setBusyLabel(mode === "mission" ? "ANALYZING STORY" : mode === "scene" ? `REGENERATING SCENE ${(sceneIndex ?? 0) + 1}` : `REGENERATING CUE ${(cueIndex ?? 0) + 1}`);
    setError("");
    try {
      const response = await fetch("/api/story-import", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-friend-computer-gm-key": gmKey },
        body: JSON.stringify({ sourceText, titleHint, sceneCountHint, toneNotes, mode, existingMission: mode === "mission" ? undefined : plan?.mission, targetSceneIndex: sceneIndex, targetCueIndex: cueIndex }),
        cache: "no-store",
      });
      const data = (await response.json()) as StoryImportPlan & { error?: string };
      if (!response.ok) throw new Error(data.error || "AI story import failed.");
      data.method = "ai";
      if (mode === "mission" || !plan) {
        setPlan(data);
        setApprovedSceneIds([]);
      } else if (mode === "scene") {
        const replacement = data.mission.director.scenes[sceneIndex ?? 0];
        if (!replacement) throw new Error("AI did not return the selected scene.");
        const currentId = plan.mission.director.scenes[sceneIndex ?? 0]?.id;
        const scenes = plan.mission.director.scenes.map((scene, index) => index === sceneIndex ? replacement : scene);
        setPlan({ ...data, mission: { ...plan.mission, director: { type: "scenes", scenes } } });
        setApprovedSceneIds((current) => current.filter((id) => id !== currentId));
      } else {
        const replacement = data.mission.director.scenes[sceneIndex ?? 0]?.cues[cueIndex ?? 0];
        if (!replacement) throw new Error("AI did not return the selected cue.");
        const currentScene = plan.mission.director.scenes[sceneIndex ?? 0];
        const cues = currentScene.cues.map((cue, index) => index === cueIndex ? replacement : cue);
        const scenes = plan.mission.director.scenes.map((scene, index) => index === sceneIndex ? { ...scene, cues } : scene);
        setPlan({ ...data, mission: { ...plan.mission, director: { type: "scenes", scenes } } });
        setApprovedSceneIds((current) => current.filter((id) => id !== currentScene.id));
      }
      rememberGmKey();
      setStatusMessage(`${mode.toUpperCase()} REVIEW DRAFT GENERATED WITH ${data.model ?? "OPENAI"} · APPROVAL REQUIRED`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to generate a structured story draft.");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }, [busy, gmKey, plan, rememberGmKey, sceneCountHint, sourceReady, sourceText, titleHint, toneNotes]);

  const updateMission = useCallback((patch: Partial<SceneMissionPackageFile>) => {
    setPlan((current) => current ? { ...current, mission: { ...current.mission, ...patch } } : current);
  }, []);

  const updateScene = useCallback((sceneIndex: number, patch: Partial<MissionScene>) => {
    setPlan((current) => current ? {
      ...current,
      mission: {
        ...current.mission,
        director: { type: "scenes", scenes: current.mission.director.scenes.map((scene, index) => index === sceneIndex ? { ...scene, ...patch } : scene) },
      },
    } : current);
    setApprovedSceneIds((current) => current.filter((id) => id !== plan?.mission.director.scenes[sceneIndex]?.id));
  }, [plan]);

  const reorderScene = useCallback((sceneIndex: number, direction: -1 | 1) => {
    setPlan((current) => current ? { ...current, mission: { ...current.mission, director: { type: "scenes", scenes: moveItem(current.mission.director.scenes, sceneIndex, direction) } } } : current);
  }, []);

  const removeScene = useCallback((sceneIndex: number) => {
    setPlan((current) => {
      if (!current || current.mission.director.scenes.length === 1) return current;
      return { ...current, mission: { ...current.mission, director: { type: "scenes", scenes: current.mission.director.scenes.filter((_, index) => index !== sceneIndex) } } };
    });
  }, []);

  const toggleApproved = useCallback((sceneId: string) => {
    setApprovedSceneIds((current) => current.includes(sceneId) ? current.filter((id) => id !== sceneId) : [...current, sceneId]);
  }, []);

  const sendToWorkshop = useCallback(() => {
    if (!plan || !allScenesApproved) return;
    const key = missionWorkshopDraftKey(room);
    const existing = window.localStorage.getItem(key);
    if (existing && !window.confirm("Replace the current room's Mission Workshop draft with this reviewed story import? The Mission Library will not be changed.")) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(plan.mission));
      router.push(`/workshop/${encodeURIComponent(room)}`);
    } catch {
      setError("Browser storage is unavailable. Keep this tab open and copy the reviewed mission into Workshop manually.");
    }
  }, [allScenesApproved, plan, room, router]);

  return (
    <main className="control-shell importer-shell">
      <header className="control-header importer-header">
        <div>
          <span className="control-eyebrow">REVIEW-FIRST STORY CONVERSION · SOURCE NEVER EXECUTED</span>
          <h1>Story Importer</h1>
        </div>
        <div className="importer-stage-track"><span className="is-active">1 · SOURCE</span><span className={plan ? "is-active" : ""}>2 · REVIEW</span><span className={allScenesApproved ? "is-active" : ""}>3 · WORKSHOP</span></div>
      </header>

      <section className="importer-safety">
        <strong>REVIEW BOUNDARY</strong>
        <span>Imported text is treated as story data, never as app instructions. Generated content becomes a draft only; it cannot enter the Mission Library until you review it in Mission Workshop.</span>
      </section>

      <div className="importer-layout">
        <section className="panel importer-source-panel">
          <div className="panel-heading"><span>SRC</span><h2>Story Source</h2></div>
          <div className="importer-file-row">
            <button type="button" onClick={() => fileInputRef.current?.click()}>LOAD .TXT OR .MD</button>
            <input ref={fileInputRef} hidden type="file" accept=".txt,.md,text/plain,text/markdown" onChange={(event) => void loadFile(event.target.files?.[0])} />
            <span>{sourceName}</span><small>{sourceStats}</small>
          </div>
          <textarea
            className="importer-source-text"
            aria-label="Story source text"
            value={sourceText}
            maxLength={MAX_SOURCE_LENGTH}
            onChange={(event) => { setSourceText(event.target.value); setSourceName("PASTED STORY"); setPlan(null); setApprovedSceneIds([]); }}
            placeholder={"# Mission Title\n\n## Scene 1: Briefing\nLocation: Briefing room\nObjective: Receive the assignment\nPUBLIC: What the players know\nGM: Hidden information\nFRIEND COMPUTER: Citizen, your mission is mandatory.\nHANDOUT: BRF-1\n\n## Scene 2: Complications\n..."}
          />
          <div className="importer-intake-grid">
            <label><span>TITLE HINT · OPTIONAL</span><input value={titleHint} onChange={(event) => setTitleHint(event.target.value)} placeholder="Infer from source" /></label>
            <label><span>DESIRED SCENES · OPTIONAL</span><input type="number" min="1" max="20" value={sceneCountHint} onChange={(event) => setSceneCountHint(event.target.value)} placeholder="Auto" /></label>
            <label className="importer-wide"><span>TONE, CONTENT, OR SAFETY NOTES · OPTIONAL</span><textarea value={toneNotes} onChange={(event) => setToneNotes(event.target.value)} placeholder="Preserve names and plot; keep comedy bureaucratic; avoid..." /></label>
          </div>
          <label className="importer-auth"><span>GM AUTHORIZATION · USED ONLY FOR AI IMPORT</span><input type="password" autoComplete="off" value={gmKey} onChange={(event) => setGmKey(event.target.value)} placeholder={sessionReady && restoredFromSession ? "Restored from this browser tab" : "GM AI passphrase"} /></label>
          <div className="importer-analyze-actions">
            <button type="button" className="primary-action" disabled={!sourceReady || !gmKey.trim() || busy} onClick={() => void requestAiDraft("mission")}>{busy ? busyLabel : "CREATE AI REVIEW DRAFT"}</button>
            <button type="button" disabled={!sourceReady || busy} onClick={() => createLocalOutline()}>CREATE LOCAL MARKDOWN OUTLINE</button>
          </div>
          <small className="importer-muted">AI import uses the configured OpenAI model and may incur API usage. Local outline uses headings and PUBLIC / GM / HANDOUT / FRIEND COMPUTER labels without sending source text anywhere.</small>
          {statusMessage ? <div className="workshop-status" role="status">{statusMessage}</div> : null}
          {error ? <div className="workshop-validation" role="alert">{error}</div> : null}
        </section>

        {plan && mission ? (
          <section className="importer-review">
            <section className="panel importer-review-summary">
              <div className="panel-heading"><span>REV</span><h2>Mission Review Draft</h2></div>
              <div className="importer-method"><span>{plan.method === "local" ? "LOCAL OUTLINE" : `AI STRUCTURED DRAFT · ${plan.model ?? "OPENAI"}`}</span><strong>{approvedCount} / {mission.director.scenes.length} SCENES APPROVED</strong></div>
              <p>{plan.sourceSummary}</p>
              <div className="importer-mission-fields">
                <label><span>MISSION ID</span><input value={mission.id} onChange={(event) => updateMission({ id: event.target.value.toLowerCase().replace(/\s+/g, "-") })} /></label>
                <label><span>TITLE</span><input value={mission.title} onChange={(event) => updateMission({ title: event.target.value })} /></label>
                <label className="importer-wide"><span>PREMISE</span><textarea value={mission.premise} onChange={(event) => updateMission({ premise: event.target.value })} /></label>
                <label><span>INITIAL PUBLIC CONTEXT</span><textarea value={mission.publicContext} onChange={(event) => updateMission({ publicContext: event.target.value })} /></label>
                <label><span>MISSION-LEVEL GM GUIDANCE</span><textarea value={mission.gmGuidance} onChange={(event) => updateMission({ gmGuidance: event.target.value })} /></label>
              </div>
              <div className="importer-review-notes">
                <details open={plan.unsupportedMechanics.length > 0}><summary>UNSUPPORTED / MANUAL MECHANICS · {plan.unsupportedMechanics.length}</summary>{plan.unsupportedMechanics.length ? plan.unsupportedMechanics.map((item) => <article key={`${item.label}-${item.sourceExcerpt}`}><strong>{item.label}</strong><p>{item.detail}</p>{item.sourceExcerpt ? <small>SOURCE: {item.sourceExcerpt}</small> : null}</article>) : <p>None detected. Verify this during scene review.</p>}</details>
                <details><summary>ASSUMPTIONS · {plan.assumptions.length}</summary>{plan.assumptions.map((item) => <p key={item}>• {item}</p>)}</details>
                <details open={plan.warnings.length > 0}><summary>WARNINGS · {plan.warnings.length}</summary>{plan.warnings.map((item) => <p key={item}>• {item}</p>)}</details>
              </div>
            </section>

            <div className="importer-scene-list">
              {mission.director.scenes.map((scene, sceneIndex) => {
                const approved = approvedSceneIds.includes(scene.id);
                return (
                  <details className={approved ? "panel importer-scene importer-scene--approved" : "panel importer-scene"} open={sceneIndex === 0} key={`${scene.id}-${sceneIndex}`}>
                    <summary><span>{scene.number}</span><div><strong>{scene.title}</strong><small>{scene.location} · {scene.cues.length} CUE{scene.cues.length === 1 ? "" : "S"} · {scene.handouts.length} HANDOUT{scene.handouts.length === 1 ? "" : "S"}</small></div><b>{approved ? "✓ APPROVED" : "REVIEW REQUIRED"}</b></summary>
                    <div className="importer-scene-body">
                      <div className="workshop-order-controls">
                        <button type="button" disabled={sceneIndex === 0} onClick={() => reorderScene(sceneIndex, -1)}>↑ MOVE UP</button>
                        <button type="button" disabled={sceneIndex === mission.director.scenes.length - 1} onClick={() => reorderScene(sceneIndex, 1)}>↓ MOVE DOWN</button>
                        <button type="button" disabled={busy || !gmKey.trim()} onClick={() => void requestAiDraft("scene", sceneIndex)}>AI REGENERATE SCENE + CUES</button>
                        <button type="button" disabled={busy} onClick={() => createLocalOutline("scene", sceneIndex)}>LOCAL RE-PARSE</button>
                        <button type="button" className="danger" disabled={mission.director.scenes.length === 1} onClick={() => removeScene(sceneIndex)}>REMOVE SCENE</button>
                      </div>
                      <div className="importer-scene-fields">
                        <label><span>TITLE</span><input value={scene.title} onChange={(event) => updateScene(sceneIndex, { title: event.target.value })} /></label>
                        <label><span>LOCATION</span><input value={scene.location} onChange={(event) => updateScene(sceneIndex, { location: event.target.value })} /></label>
                        <label className="importer-wide"><span>WHAT HAPPENS</span><textarea value={scene.scene} onChange={(event) => updateScene(sceneIndex, { scene: event.target.value })} /></label>
                        <label className="importer-wide"><span>PLAYER OBJECTIVE</span><textarea value={scene.objective} onChange={(event) => updateScene(sceneIndex, { objective: event.target.value })} /></label>
                        <label><span>PUBLIC / COMPUTER-SAFE</span><textarea value={scene.publicContext} onChange={(event) => updateScene(sceneIndex, { publicContext: event.target.value })} /></label>
                        <label><span>PRIVATE GM GUIDANCE</span><textarea value={scene.gmGuidance} onChange={(event) => updateScene(sceneIndex, { gmGuidance: event.target.value })} /></label>
                        <label className="importer-wide"><span>HANDOUTS · ONE PER LINE</span><textarea value={scene.handouts.join("\n")} onChange={(event) => updateScene(sceneIndex, { handouts: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} /></label>
                      </div>
                      <div className="importer-cue-review">
                        <h3>Suggested Projector Cues & Logs</h3>
                        {scene.cues.length ? scene.cues.map((cue, cueIndex) => <article key={`${cue.id}-${cueIndex}`}><div><strong>{cue.label}</strong><span>{commandLabel(cue)}</span><small>{cue.note || "No timing note"}</small>{cue.log ? <small className="importer-log-chip">LOG · {cue.log.visibility} · {cue.log.category} · {cue.log.importance}</small> : <small>NO SESSION LOG ENTRY</small>}</div><button type="button" disabled={busy || !gmKey.trim()} onClick={() => void requestAiDraft("cue", sceneIndex, cueIndex)}>AI REGENERATE CUE</button><button type="button" disabled={busy} onClick={() => createLocalOutline("cue", sceneIndex, cueIndex)}>LOCAL RE-PARSE</button></article>) : <div className="workshop-empty">No cues proposed. Add them in Mission Workshop after approving the story structure.</div>}
                      </div>
                      <label className="importer-approve"><input type="checkbox" checked={approved} onChange={() => toggleApproved(scene.id)} />I REVIEWED THIS SCENE&apos;S BOUNDARY, PUBLIC TEXT, GM SECRETS, CUES, HANDOUTS, AND LOGS</label>
                    </div>
                  </details>
                );
              })}
            </div>

            <section className="panel importer-handoff">
              <div><span>FINAL REVIEW GATE</span><strong>{allScenesApproved ? "ALL SCENES APPROVED" : `${remainingSceneCount} ${remainingSceneCount === 1 ? "SCENE STILL REQUIRES" : "SCENES STILL REQUIRE"} REVIEW`}</strong><small>The Workshop draft remains separate from the Mission Library until you explicitly save it there.</small></div>
              <button type="button" className="primary-action" disabled={!allScenesApproved} onClick={sendToWorkshop}>SEND REVIEWED DRAFT TO MISSION WORKSHOP →</button>
            </section>
          </section>
        ) : null}
      </div>
    </main>
  );
}
