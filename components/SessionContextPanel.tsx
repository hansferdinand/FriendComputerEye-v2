"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

const STATUSES = ["PLANNING", "ACTIVE", "PAUSED", "COMPLETE"] as const;
type SessionStatus = (typeof STATUSES)[number];

type SessionContext = {
  status: SessionStatus;
  missionTitle: string;
  location: string;
  scene: string;
  currentObjective: string;
  publicContext: string;
  gmGuidance: string;
  updatedAt: string | null;
};

function emptyContext(): SessionContext {
  return {
    status: "PLANNING",
    missionTitle: "",
    location: "",
    scene: "",
    currentObjective: "",
    publicContext: "",
    gmGuidance: "",
    updatedAt: null,
  };
}

export function SessionContextPanel({ room }: { room: string }) {
  const [gmKey, setGmKey] = useState("");
  const [context, setContext] = useState<SessionContext>(emptyContext);
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");

  const authorizedFetch = useCallback(async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/session-context", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-friend-computer-gm-key": gmKey,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Session context request failed.");
    return data;
  }, [gmKey]);

  const loadContext = useCallback(async () => {
    if (!gmKey.trim()) return;
    setBusy(true);
    setError("");
    setStatusMessage("");
    try {
      const data = await authorizedFetch({ action: "get", room });
      const row = data.context && typeof data.context === "object" ? data.context as Record<string, unknown> : {};
      const status = String(row.status ?? "PLANNING") as SessionStatus;
      setContext({
        status: STATUSES.includes(status) ? status : "PLANNING",
        missionTitle: String(row.mission_title ?? ""),
        location: String(row.location ?? ""),
        scene: String(row.scene ?? ""),
        currentObjective: String(row.current_objective ?? ""),
        publicContext: String(row.public_context ?? ""),
        gmGuidance: String(row.gm_guidance ?? ""),
        updatedAt: row.updated_at ? String(row.updated_at) : null,
      });
      setUnlocked(true);
      setStatusMessage("PERSISTENT SESSION CONTEXT LOADED");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load session context.");
    } finally {
      setBusy(false);
    }
  }, [authorizedFetch, gmKey, room]);

  const saveContext = useCallback(async () => {
    setBusy(true);
    setError("");
    setStatusMessage("");
    try {
      await authorizedFetch({
        action: "save",
        room,
        status: context.status,
        missionTitle: context.missionTitle,
        location: context.location,
        scene: context.scene,
        currentObjective: context.currentObjective,
        publicContext: context.publicContext,
        gmGuidance: context.gmGuidance,
      });
      const now = new Date().toISOString();
      setContext((current) => ({ ...current, updatedAt: now }));
      setStatusMessage("SESSION CONTEXT SAVED · COPILOT WILL USE IT ON THE NEXT REQUEST");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save session context.");
    } finally {
      setBusy(false);
    }
  }, [authorizedFetch, context, room]);

  const update = <K extends keyof SessionContext>(key: K, value: SessionContext[K]) => {
    setContext((current) => ({ ...current, [key]: value }));
  };

  return (
    <main className="control-shell">
      <header className="control-header">
        <div>
          <span className="control-eyebrow">MILESTONE 5 · PERSISTENT GAME STATE</span>
          <h1>Mission Context</h1>
        </div>
        <div className="control-header-actions">
          <Link className="display-link" href={`/readiness/${encodeURIComponent(room)}`}>SHOW READINESS</Link>
          <Link className="display-link" href={`/control/${encodeURIComponent(room)}`}>MANUAL CONTROLS</Link>
          <Link className="display-link" href={`/copilot/${encodeURIComponent(room)}`}>AI COPILOT</Link>
          <Link className="display-link" href={`/communications/${encodeURIComponent(room)}`}>COMMUNICATIONS</Link>
        </div>
      </header>

      <div className="control-grid">
        <section className="panel" style={{ gridColumn: "1 / -1" }}>
          <div className="panel-heading"><span>CTX</span><h2>GM Authorization</h2></div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) auto", gap: 10 }}>
            <input
              type="password"
              autoComplete="off"
              value={gmKey}
              onChange={(event) => setGmKey(event.target.value)}
              placeholder="GM AI passphrase"
              aria-label="GM authorization passphrase"
            />
            <button type="button" className="primary-action" disabled={busy || !gmKey.trim()} onClick={() => void loadContext()}>
              {busy ? "AUTHORIZING…" : unlocked ? "RELOAD CONTEXT" : "UNLOCK SESSION"}
            </button>
          </div>
          {statusMessage ? <div style={{ marginTop: 10, color: "#87f6fb", fontSize: 12 }}>{statusMessage}</div> : null}
          {error ? <div style={{ marginTop: 10, color: "#ff8d86", fontSize: 12 }}>{error}</div> : null}
          <small style={{ display: "block", marginTop: 10, color: "#6e9499", lineHeight: 1.45 }}>
            Context is stored in the private Friend Computer Supabase tables and retrieved only through the GM-key-gated server API.
          </small>
        </section>

        {unlocked ? (
          <>
            <section className="panel">
              <div className="panel-heading"><span>01</span><h2>Mission Snapshot</h2></div>
              <div style={{ display: "grid", gap: 10 }}>
                <label style={{ display: "grid", gap: 5, color: "#8fbfc3", fontSize: 11 }}>
                  SESSION STATUS
                  <select value={context.status} onChange={(event) => update("status", event.target.value as SessionStatus)}>
                    {STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 5, color: "#8fbfc3", fontSize: 11 }}>
                  MISSION TITLE
                  <input value={context.missionTitle} maxLength={160} onChange={(event) => update("missionTitle", event.target.value)} placeholder="Operation Mandatory Synergy" />
                </label>
                <label style={{ display: "grid", gap: 5, color: "#8fbfc3", fontSize: 11 }}>
                  CURRENT LOCATION
                  <input value={context.location} maxLength={160} onChange={(event) => update("location", event.target.value)} placeholder="PLC Sector Briefing Room 12-B" />
                </label>
                <label style={{ display: "grid", gap: 5, color: "#8fbfc3", fontSize: 11 }}>
                  CURRENT SCENE
                  <input value={context.scene} maxLength={240} onChange={(event) => update("scene", event.target.value)} placeholder="Troubleshooters have just received contradictory orders" />
                </label>
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading"><span>02</span><h2>Current Objective</h2></div>
              <textarea
                value={context.currentObjective}
                maxLength={500}
                onChange={(event) => update("currentObjective", event.target.value)}
                placeholder="What is the team currently trying to accomplish?"
                style={{ minHeight: 190 }}
              />
              <small style={{ display: "block", marginTop: 7, color: "#6e9499" }}>{context.currentObjective.length}/500</small>
            </section>

            <section className="panel" style={{ gridColumn: "1 / -1" }}>
              <div className="panel-heading"><span>FC</span><h2>Friend Computer Knowledge</h2></div>
              <textarea
                value={context.publicContext}
                maxLength={4000}
                onChange={(event) => update("publicContext", event.target.value)}
                placeholder="Facts Friend Computer may know and reference in-character: mission background, official orders, recent events, named NPCs, known equipment problems, etc."
                style={{ minHeight: 150 }}
              />
              <small style={{ display: "block", marginTop: 7, color: "#6e9499", lineHeight: 1.4 }}>
                This text is supplied to Copilot as in-world context and may be referenced directly in Friend Computer&apos;s replies. {context.publicContext.length}/4000
              </small>
            </section>

            <section className="panel" style={{ gridColumn: "1 / -1" }}>
              <div className="panel-heading"><span>GM</span><h2>Private GM Guidance</h2></div>
              <textarea
                value={context.gmGuidance}
                maxLength={4000}
                onChange={(event) => update("gmGuidance", event.target.value)}
                placeholder="Behind-the-scenes direction for Copilot: what tone to favor, hidden agendas, who should look suspicious, facts the players must not learn yet, etc."
                style={{ minHeight: 150 }}
              />
              <small style={{ display: "block", marginTop: 7, color: "#b1a56b", lineHeight: 1.4 }}>
                Private GM Guidance is sent to OpenAI when Copilot runs, but Copilot is instructed not to quote it, identify it as GM guidance, or reveal hidden information merely because it appears here. {context.gmGuidance.length}/4000
              </small>
            </section>

            <section className="panel" style={{ gridColumn: "1 / -1" }}>
              <div className="button-row" style={{ marginTop: 0 }}>
                <button type="button" className="primary-action" disabled={busy} onClick={() => void saveContext()}>
                  {busy ? "SAVING…" : "SAVE SESSION CONTEXT"}
                </button>
                <Link className="display-link" href={`/copilot/${encodeURIComponent(room)}`}>OPEN COPILOT</Link>
              </div>
              <small style={{ display: "block", marginTop: 10, color: "#6e9499" }}>
                {context.updatedAt ? `Last saved: ${new Date(context.updatedAt).toLocaleString()}` : "No saved context yet."}
              </small>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
