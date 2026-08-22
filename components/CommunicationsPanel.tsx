"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

const CLEARANCES = ["INFRARED", "RED", "ORANGE", "YELLOW", "GREEN", "BLUE", "INDIGO", "VIOLET", "ULTRAVIOLET"] as const;

type Citizen = {
  seat: number;
  citizenId: string;
  displayName: string;
  clearance: (typeof CLEARANCES)[number];
  cloneNumber: number;
  email: string;
  commendationPoints: number;
  treasonPoints: number;
};

type Notice = {
  id: number;
  seat: number;
  notice_kind: string;
  sender_persona: string;
  subject: string;
  sent_at: string;
  response: string | null;
  responded_at: string | null;
};

type NoticeKind = "commendation" | "treason_warning" | "secret_assignment" | "happiness_notice" | "clone_notice" | "custom";
type SenderPersona = "friend_computer" | "citizen_services" | "internal_security" | "happiness_office" | "termination_services";

const SENDER_LABELS: Record<SenderPersona, string> = {
  friend_computer: "Friend Computer",
  citizen_services: "Citizen Services",
  internal_security: "Internal Security",
  happiness_office: "Happiness Office",
  termination_services: "Termination Services",
};

const PRESETS: Record<Exclude<NoticeKind, "custom">, { sender: SenderPersona; subject: string; body: string }> = {
  commendation: {
    sender: "friend_computer",
    subject: "MANDATORY COMMENDATION RECORDED",
    body: "Citizen, Friend Computer has observed conduct marginally exceeding minimum loyalty expectations. A commendation has been entered into your record. Please continue deserving it until further notice.",
  },
  treason_warning: {
    sender: "internal_security",
    subject: "PRELIMINARY TREASON WARNING",
    body: "Citizen, certain recent activities have generated an entirely routine quantity of suspicion. This is not an accusation. It is an opportunity to demonstrate innocence before the accusation becomes necessary.",
  },
  secret_assignment: {
    sender: "internal_security",
    subject: "CLASSIFIED ASSIGNMENT — EYES ONLY",
    body: "Citizen, you have been selected for a confidential assignment because of your proven discretion and the absence of any available alternatives. Do not discuss this directive with your teammates unless instructed to do so.",
  },
  happiness_notice: {
    sender: "happiness_office",
    subject: "MANDATORY HAPPINESS COMPLIANCE NOTICE",
    body: "Citizen, your current happiness output appears statistically ambiguous. Please correct your emotional posture immediately. Remember: happiness is mandatory, measurable, and easier for everyone when sincerely performed.",
  },
  clone_notice: {
    sender: "termination_services",
    subject: "CLONE CONTINUITY ADVISORY",
    body: "Citizen, Termination Services has reviewed your current clone continuity status. No action is required unless you experience death, suspected death, administrative death, or an unauthorized interruption in being alive.",
  },
};

function defaultCitizen(seat: number): Citizen {
  return {
    seat,
    citizenId: `CITIZEN-${seat}-R-ALPHA-1`,
    displayName: `Citizen ${seat}`,
    clearance: "RED",
    cloneNumber: 1,
    email: "",
    commendationPoints: 0,
    treasonPoints: 0,
  };
}

export function CommunicationsPanel({ room }: { room: string }) {
  const [gmKey, setGmKey] = useState("");
  const [citizens, setCitizens] = useState<Citizen[]>(() => [1, 2, 3, 4].map(defaultCitizen));
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [recipientSeat, setRecipientSeat] = useState(1);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>("secret_assignment");
  const [senderPersona, setSenderPersona] = useState<SenderPersona>(PRESETS.secret_assignment.sender);
  const [subject, setSubject] = useState(PRESETS.secret_assignment.subject);
  const [body, setBody] = useState(PRESETS.secret_assignment.body);
  const [includeResponse, setIncludeResponse] = useState(true);

  const authorizedFetch = useCallback(async (payload: Record<string, unknown>, endpoint = "/api/roster") => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-friend-computer-gm-key": gmKey },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Alpha Complex request failed.");
    return data;
  }, [gmKey]);

  const loadNotices = useCallback(async () => {
    const data = await authorizedFetch({ action: "recent_notices", room });
    setNotices(Array.isArray(data.notices) ? (data.notices as Notice[]) : []);
  }, [authorizedFetch, room]);

  const loadDirectory = useCallback(async () => {
    if (!gmKey.trim()) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const data = await authorizedFetch({ action: "list", room });
      const rows = Array.isArray(data.citizens) ? data.citizens as Array<Record<string, unknown>> : [];
      setCitizens([1, 2, 3, 4].map((seat) => {
        const row = rows.find((candidate) => Number(candidate.seat) === seat);
        if (!row) return defaultCitizen(seat);
        const clearance = String(row.clearance ?? "RED") as Citizen["clearance"];
        return {
          seat,
          citizenId: String(row.citizen_id ?? `CITIZEN-${seat}-R-ALPHA-1`),
          displayName: String(row.display_name ?? `Citizen ${seat}`),
          clearance: CLEARANCES.includes(clearance) ? clearance : "RED",
          cloneNumber: Number(row.clone_number ?? 1),
          email: String(row.email ?? ""),
          commendationPoints: Number(row.commendation_points ?? 0),
          treasonPoints: Number(row.treason_points ?? 0),
        };
      }));
      setUnlocked(true);
      setStatus("CITIZEN DIRECTORY UNLOCKED");
      await loadNotices();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to unlock citizen directory.");
    } finally {
      setBusy(false);
    }
  }, [authorizedFetch, gmKey, loadNotices, room]);

  const updateCitizen = (seat: number, patch: Partial<Citizen>) => {
    setCitizens((current) => current.map((citizen) => citizen.seat === seat ? { ...citizen, ...patch } : citizen));
  };

  const saveCitizen = async (citizen: Citizen) => {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await authorizedFetch({ action: "upsert", room, citizen });
      setStatus(`${citizen.citizenId} SAVED · EMAIL ENCRYPTED AT REST`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save citizen.");
    } finally {
      setBusy(false);
    }
  };

  const adjustPoints = async (seat: number, type: "commendation" | "treason", delta: number) => {
    try {
      await authorizedFetch({
        action: "adjust_points",
        room,
        seat,
        commendationDelta: type === "commendation" ? delta : 0,
        treasonDelta: type === "treason" ? delta : 0,
      });
      const citizen = citizens.find((item) => item.seat === seat);
      if (citizen) updateCitizen(seat, {
        commendationPoints: citizen.commendationPoints + (type === "commendation" ? delta : 0),
        treasonPoints: citizen.treasonPoints + (type === "treason" ? delta : 0),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update points.");
    }
  };

  const applyPreset = (kind: NoticeKind) => {
    setNoticeKind(kind);
    if (kind === "custom") return;
    const preset = PRESETS[kind];
    setSenderPersona(preset.sender);
    setSubject(preset.subject);
    setBody(preset.body);
  };

  const recipient = useMemo(() => citizens.find((citizen) => citizen.seat === recipientSeat) ?? citizens[0], [citizens, recipientSeat]);

  const sendNotice = async () => {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await authorizedFetch({ room, seat: recipientSeat, senderPersona, noticeKind, subject, body, includeResponse }, "/api/notices/send");
      setStatus(`OFFICIAL NOTICE SENT TO ${recipient.citizenId}`);
      await loadNotices();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to send official notice.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="control-shell">
      <header className="control-header">
        <div><span className="control-eyebrow">ALPHA COMPLEX BUREAUCRATIC NETWORK</span><h1>Citizen Communications</h1></div>
        <div className="control-header-actions">
          <Link className="display-link" href={`/control/${encodeURIComponent(room)}`}>MANUAL CONTROLS</Link>
          <Link className="display-link" href={`/copilot/${encodeURIComponent(room)}`}>AI COPILOT</Link>
          <Link className="display-link" href={`/display/${encodeURIComponent(room)}`} target="_blank">OPEN DISPLAY ↗</Link>
        </div>
      </header>

      <div className="control-grid">
        <section className="panel" style={{ gridColumn: "1 / -1" }}>
          <div className="panel-heading"><span>04</span><h2>Directory Authorization</h2></div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) auto", gap: 10 }}>
            <input type="password" autoComplete="off" value={gmKey} onChange={(event) => setGmKey(event.target.value)} placeholder="GM AI passphrase" aria-label="GM authorization passphrase" />
            <button type="button" className="primary-action" disabled={busy || !gmKey.trim()} onClick={() => void loadDirectory()}>{busy ? "AUTHORIZING…" : unlocked ? "REFRESH DIRECTORY" : "UNLOCK DIRECTORY"}</button>
          </div>
          {status ? <div style={{ marginTop: 10, color: "#87f6fb", fontSize: 12 }}>{status}</div> : null}
          {error ? <div style={{ marginTop: 10, color: "#ff8d86", fontSize: 12 }}>{error}</div> : null}
          <small style={{ display: "block", marginTop: 10, color: "#6e9499", lineHeight: 1.45 }}>Real email addresses are encrypted in Supabase with the GM passphrase. They are never included in Friend Computer AI prompts.</small>
        </section>

        {unlocked ? citizens.map((citizen) => (
          <section className="panel" key={citizen.seat}>
            <div className="panel-heading"><span>{String(citizen.seat).padStart(2, "0")}</span><h2>{citizen.displayName}</h2></div>
            <div style={{ display: "grid", gap: 9 }}>
              <input value={citizen.citizenId} onChange={(event) => updateCitizen(citizen.seat, { citizenId: event.target.value })} placeholder="Citizen ID" />
              <input value={citizen.displayName} onChange={(event) => updateCitizen(citizen.seat, { displayName: event.target.value })} placeholder="Display name" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 8 }}>
                <select value={citizen.clearance} onChange={(event) => updateCitizen(citizen.seat, { clearance: event.target.value as Citizen["clearance"] })}>{CLEARANCES.map((level) => <option value={level} key={level}>{level}</option>)}</select>
                <input type="number" min={1} max={99} value={citizen.cloneNumber} onChange={(event) => updateCitizen(citizen.seat, { cloneNumber: Number(event.target.value) || 1 })} aria-label="Clone number" />
              </div>
              <input type="email" value={citizen.email} onChange={(event) => updateCitizen(citizen.seat, { email: event.target.value })} placeholder="Real player email (encrypted)" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ border: "1px solid #1e4347", padding: 8, fontSize: 12 }}>COMMENDATIONS <strong>{citizen.commendationPoints}</strong><div className="button-row" style={{ marginTop: 6 }}><button type="button" onClick={() => void adjustPoints(citizen.seat, "commendation", -1)}>−</button><button type="button" onClick={() => void adjustPoints(citizen.seat, "commendation", 1)}>+</button></div></div>
                <div style={{ border: "1px solid #1e4347", padding: 8, fontSize: 12 }}>TREASON <strong>{citizen.treasonPoints}</strong><div className="button-row" style={{ marginTop: 6 }}><button type="button" onClick={() => void adjustPoints(citizen.seat, "treason", -1)}>−</button><button type="button" className="danger" onClick={() => void adjustPoints(citizen.seat, "treason", 1)}>+</button></div></div>
              </div>
              <button type="button" onClick={() => void saveCitizen(citizen)} disabled={busy}>SAVE CITIZEN</button>
            </div>
          </section>
        )) : null}

        {unlocked ? (
          <section className="panel" style={{ gridColumn: "1 / -1" }}>
            <div className="panel-heading"><span>✉</span><h2>Official Citizen Notice</h2></div>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }}>
                <select value={recipientSeat} onChange={(event) => setRecipientSeat(Number(event.target.value))}>{citizens.map((citizen) => <option value={citizen.seat} key={citizen.seat}>Seat {citizen.seat} · {citizen.citizenId}{citizen.email ? "" : " · NO EMAIL"}</option>)}</select>
                <select value={noticeKind} onChange={(event) => applyPreset(event.target.value as NoticeKind)}><option value="commendation">Commendation</option><option value="treason_warning">Treason Warning</option><option value="secret_assignment">Secret Assignment</option><option value="happiness_notice">Happiness Notice</option><option value="clone_notice">Clone Advisory</option><option value="custom">Custom Notice</option></select>
                <select value={senderPersona} onChange={(event) => setSenderPersona(event.target.value as SenderPersona)}>{Object.entries(SENDER_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
              </div>
              <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" maxLength={160} />
              <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Official notice body" style={{ minHeight: 150 }} maxLength={4000} />
              <div className="button-row" style={{ marginTop: 0 }}>
                <button type="button" className={includeResponse ? "is-active" : ""} onClick={() => setIncludeResponse((value) => !value)}>ACK / DENY LINKS {includeResponse ? "ON" : "OFF"}</button>
                <button type="button" className="primary-action" disabled={busy || !recipient.email || !subject.trim() || !body.trim()} onClick={() => void sendNotice()}>{busy ? "TRANSMITTING…" : "SEND OFFICIAL NOTICE"}</button>
              </div>
              <small style={{ color: "#6e9499" }}>From: {SENDER_LABELS[senderPersona]} &lt;{senderPersona.replaceAll("_", "-")}@alphacomplex.space&gt; · To: {recipient.email || "NO EMAIL ON FILE"}</small>
            </div>
          </section>
        ) : null}

        {unlocked ? (
          <section className="panel" style={{ gridColumn: "1 / -1" }}>
            <div className="panel-heading"><span>LOG</span><h2>Recent Official Notices</h2></div>
            {notices.length === 0 ? <div style={{ color: "#6e9499" }}>No notices recorded for this room.</div> : <div style={{ display: "grid", gap: 7 }}>{notices.map((notice) => <div key={notice.id} style={{ border: "1px solid #1e4347", padding: 9, display: "grid", gridTemplateColumns: "70px minmax(0,1fr) auto", gap: 8, alignItems: "center", fontSize: 12 }}><strong>SEAT {notice.seat}</strong><span><strong>{notice.subject}</strong><br/><span style={{ color: "#6e9499" }}>{notice.notice_kind.replaceAll("_", " ")} · {SENDER_LABELS[notice.sender_persona as SenderPersona] ?? notice.sender_persona}</span></span><span style={{ color: notice.response === "DENIED" ? "#ff8d86" : notice.response ? "#87f6fb" : "#b1a56b" }}>{notice.response ?? "AWAITING RESPONSE"}</span></div>)}</div>}
          </section>
        ) : null}
      </div>
    </main>
  );
}
