"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

const MAX_CITIZENS = 16;
const CATEGORIES = ["GENERAL", "MISSION", "DISCOVERY", "ACCUSATION", "CLONE", "NPC", "EQUIPMENT", "SECRET_ORDER", "DEBRIEF"] as const;
const VISIBILITIES = ["COMPUTER", "GM_ONLY"] as const;
const IMPORTANCES = ["MINOR", "NORMAL", "IMPORTANT"] as const;

type Category = (typeof CATEGORIES)[number];
type Visibility = (typeof VISIBILITIES)[number];
type Importance = (typeof IMPORTANCES)[number];
type Filter = "ALL" | Visibility;

type SessionEvent = {
  id: number;
  category: Category;
  visibility: Visibility;
  importance: Importance;
  seat: number | null;
  title: string;
  detail: string;
  occurred_at: string;
  created_at: string;
};

const CATEGORY_LABELS: Record<Category, string> = {
  GENERAL: "General",
  MISSION: "Mission",
  DISCOVERY: "Discovery",
  ACCUSATION: "Accusation",
  CLONE: "Clone",
  NPC: "NPC",
  EQUIPMENT: "Equipment",
  SECRET_ORDER: "Secret Order",
  DEBRIEF: "Debrief",
};

function eventColor(event: SessionEvent) {
  if (event.visibility === "GM_ONLY") return "#b1a56b";
  if (event.importance === "IMPORTANT") return "#87f6fb";
  return "#8fbfc3";
}

export function SessionEventLogPanel({ room }: { room: string }) {
  const [gmKey, setGmKey] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [category, setCategory] = useState<Category>("GENERAL");
  const [visibility, setVisibility] = useState<Visibility>("COMPUTER");
  const [importance, setImportance] = useState<Importance>("NORMAL");
  const [seat, setSeat] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const authorizedFetch = useCallback(async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/session-events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-friend-computer-gm-key": gmKey,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Session event request failed.");
    return data;
  }, [gmKey]);

  const loadEvents = useCallback(async () => {
    if (!gmKey.trim()) return;
    setBusy(true);
    setError("");
    try {
      const data = await authorizedFetch({ action: "list", room, limit: 100 });
      setEvents(Array.isArray(data.events) ? data.events as SessionEvent[] : []);
      setUnlocked(true);
      setStatus("SESSION MEMORY ONLINE");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load session log.");
    } finally {
      setBusy(false);
    }
  }, [authorizedFetch, gmKey, room]);

  const addEvent = useCallback(async () => {
    if (!title.trim()) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await authorizedFetch({
        action: "add",
        room,
        category,
        visibility,
        importance,
        seat,
        title,
        detail,
        occurredAt: new Date().toISOString(),
      });
      setTitle("");
      setDetail("");
      setSeat(null);
      setImportance("NORMAL");
      setStatus("EVENT RECORDED · COPILOT MEMORY UPDATED");
      const data = await authorizedFetch({ action: "list", room, limit: 100 });
      setEvents(Array.isArray(data.events) ? data.events as SessionEvent[] : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to record session event.");
    } finally {
      setBusy(false);
    }
  }, [authorizedFetch, category, detail, importance, room, seat, title, visibility]);

  const deleteEvent = useCallback(async (event: SessionEvent) => {
    if (!window.confirm(`Delete event: ${event.title}?`)) return;
    setBusy(true);
    setError("");
    try {
      await authorizedFetch({ action: "delete", room, id: event.id });
      setEvents((current) => current.filter((item) => item.id !== event.id));
      setStatus("EVENT REMOVED");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to delete event.");
    } finally {
      setBusy(false);
    }
  }, [authorizedFetch, room]);

  const visibleEvents = useMemo(() => filter === "ALL" ? events : events.filter((event) => event.visibility === filter), [events, filter]);
  const importantCount = events.filter((event) => event.importance === "IMPORTANT").length;
  const gmOnlyCount = events.filter((event) => event.visibility === "GM_ONLY").length;

  return (
    <main className="control-shell">
      <header className="control-header">
        <div>
          <span className="control-eyebrow">MILESTONE 5 · PERSISTENT SESSION MEMORY</span>
          <h1>Session Log</h1>
        </div>
        <div className="control-header-actions">
          <Link className="display-link" href={`/mission/${encodeURIComponent(room)}`}>MISSION DIRECTOR</Link>
          <Link className="display-link" href={`/session/${encodeURIComponent(room)}`}>MISSION CONTEXT</Link>
          <Link className="display-link" href={`/readiness/${encodeURIComponent(room)}`}>SHOW READINESS</Link>
          <Link className="display-link" href={`/communications/${encodeURIComponent(room)}`}>COMMUNICATIONS</Link>
          <Link className="display-link" href={`/copilot/${encodeURIComponent(room)}`}>AI COPILOT</Link>
          <Link className="display-link" href={`/control/${encodeURIComponent(room)}`}>MANUAL CONTROLS</Link>
        </div>
      </header>

      <div className="control-grid">
        <section className="panel" style={{ gridColumn: "1 / -1" }}>
          <div className="panel-heading"><span>LOG</span><h2>GM Authorization</h2></div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) auto", gap: 10 }}>
            <input type="password" autoComplete="off" value={gmKey} onChange={(event) => setGmKey(event.target.value)} placeholder="GM AI passphrase" />
            <button type="button" className="primary-action" disabled={busy || !gmKey.trim()} onClick={() => void loadEvents()}>{busy ? "LOADING…" : unlocked ? "REFRESH LOG" : "UNLOCK SESSION LOG"}</button>
          </div>
          {status ? <div style={{ marginTop: 10, color: "#87f6fb", fontSize: 12 }}>{status}</div> : null}
          {error ? <div style={{ marginTop: 10, color: "#ff8d86", fontSize: 12 }}>{error}</div> : null}
          <small style={{ display: "block", marginTop: 10, color: "#6e9499", lineHeight: 1.45 }}>COMPUTER events are in-world memory Friend Computer may reference. GM ONLY events can influence Copilot but must not be disclosed merely because they are logged.</small>
        </section>

        {unlocked ? (
          <>
            <section className="panel" style={{ gridColumn: "1 / -1" }}>
              <div className="panel-heading"><span>+</span><h2>Record Event</h2></div>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
                  <select value={category} onChange={(event) => setCategory(event.target.value as Category)}>{CATEGORIES.map((item) => <option value={item} key={item}>{CATEGORY_LABELS[item]}</option>)}</select>
                  <select value={visibility} onChange={(event) => setVisibility(event.target.value as Visibility)}><option value="COMPUTER">Computer-visible</option><option value="GM_ONLY">GM only</option></select>
                  <select value={importance} onChange={(event) => setImportance(event.target.value as Importance)}>{IMPORTANCES.map((item) => <option value={item} key={item}>{item}</option>)}</select>
                  <select value={seat ?? ""} onChange={(event) => setSeat(event.target.value ? Number(event.target.value) : null)}><option value="">No specific Citizen</option>{Array.from({ length: MAX_CITIZENS }, (_, index) => <option key={index + 1} value={index + 1}>Seat {index + 1}</option>)}</select>
                </div>
                <input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="What happened?" />
                <textarea value={detail} maxLength={1200} onChange={(event) => setDetail(event.target.value)} placeholder="Optional details, consequences, names, clues, or private GM notes…" style={{ minHeight: 110 }} />
                <div className="button-row" style={{ marginTop: 0 }}><button type="button" className="primary-action" disabled={busy || !title.trim()} onClick={() => void addEvent()}>{busy ? "RECORDING…" : "RECORD EVENT"}</button><small style={{ color: visibility === "GM_ONLY" ? "#b1a56b" : "#6e9499", alignSelf: "center" }}>{visibility === "GM_ONLY" ? "PRIVATE GM MEMORY" : "FRIEND COMPUTER MAY REMEMBER THIS"}</small></div>
              </div>
            </section>

            <section className="panel" style={{ gridColumn: "1 / -1" }}>
              <div className="panel-heading"><span>{events.length}</span><h2>Timeline</h2></div>
              <div className="button-row" style={{ marginTop: 0, marginBottom: 10 }}>
                <button type="button" className={filter === "ALL" ? "is-active" : ""} onClick={() => setFilter("ALL")}>ALL {events.length}</button>
                <button type="button" className={filter === "COMPUTER" ? "is-active" : ""} onClick={() => setFilter("COMPUTER")}>COMPUTER</button>
                <button type="button" className={filter === "GM_ONLY" ? "is-active" : ""} onClick={() => setFilter("GM_ONLY")}>GM ONLY {gmOnlyCount}</button>
                <span style={{ color: "#87f6fb", fontSize: 11, alignSelf: "center" }}>{importantCount} IMPORTANT</span>
              </div>
              {visibleEvents.length === 0 ? <div style={{ color: "#6e9499" }}>No events recorded yet.</div> : <div style={{ display: "grid", gap: 8 }}>{visibleEvents.map((event) => (
                <article key={event.id} style={{ border: `1px solid ${event.visibility === "GM_ONLY" ? "#5c5330" : event.importance === "IMPORTANT" ? "#397e83" : "#1e4347"}`, padding: 11, background: event.visibility === "GM_ONLY" ? "#110f08" : "#041013" }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "space-between" }}>
                    <div>
                      <strong style={{ color: eventColor(event) }}>{event.title}</strong>
                      <div style={{ color: "#6e9499", fontSize: 11, marginTop: 4 }}>{new Date(event.occurred_at).toLocaleString()} · {CATEGORY_LABELS[event.category]} · {event.importance}{event.seat ? ` · SEAT ${event.seat}` : ""} · {event.visibility === "GM_ONLY" ? "GM ONLY" : "COMPUTER MEMORY"}</div>
                    </div>
                    <button type="button" className="danger" disabled={busy} onClick={() => void deleteEvent(event)}>DELETE</button>
                  </div>
                  {event.detail ? <div style={{ whiteSpace: "pre-wrap", color: "#a8c7ca", fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>{event.detail}</div> : null}
                </article>
              ))}</div>}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
