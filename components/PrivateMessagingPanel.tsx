"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGmSession } from "@/lib/gm-session";

type MessageSettings = {
  allow_player_to_player: boolean;
  retention_hours: number;
  gm_can_read_player_to_player: boolean;
};

type Invite = {
  seat: number;
  citizen_id: string;
  display_name: string;
  invite_active: boolean;
  expires_at: string | null;
  last_seen_at: string | null;
};

type DirectMessage = {
  id: number;
  sender_kind: "gm" | "citizen";
  sender_seat: number | null;
  sender_name: string;
  recipient_kind: "gm" | "citizen";
  recipient_seat: number | null;
  recipient_name: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

const QUICK_MESSAGES = [
  "Report privately to Friend Computer.",
  "Your discretion has been noted. Continue without alerting the others.",
  "Please clarify exactly what you observed and who else was present.",
  "Acknowledged. This conversation is now part of your permanent record.",
];

function relativeTime(value: string | null) {
  if (!value) return "NEVER";
  const deltaMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (deltaMinutes < 1) return "JUST NOW";
  if (deltaMinutes < 60) return `${deltaMinutes}M AGO`;
  const hours = Math.floor(deltaMinutes / 60);
  if (hours < 48) return `${hours}H AGO`;
  return `${Math.floor(hours / 24)}D AGO`;
}

function deliveryState(message: DirectMessage, observedPlayerTraffic: boolean) {
  if (message.sender_kind === "gm") return message.read_at ? "READ" : "SENT";
  if (observedPlayerTraffic) return message.read_at ? "RECIPIENT READ" : "RECIPIENT UNREAD";
  return "RECEIVED";
}

export function PrivateMessagingPanel({ room }: { room: string }) {
  const { gmKey, setGmKey, rememberGmKey, sessionReady, restoredFromSession } = useGmSession();
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [settings, setSettings] = useState<MessageSettings>({
    allow_player_to_player: false,
    retention_hours: 168,
    gm_can_read_player_to_player: true,
  });
  const [invites, setInvites] = useState<Invite[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [freshLinks, setFreshLinks] = useState<Record<number, string>>({});
  const [confirmClear, setConfirmClear] = useState(false);
  const autoUnlockAttempted = useRef(false);

  const request = useCallback(async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-friend-computer-gm-key": gmKey,
      },
      body: JSON.stringify({ ...payload, room }),
    });
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Messaging request failed.");
    return data;
  }, [gmKey, room]);

  const load = useCallback(async (quiet = false) => {
    if (!gmKey.trim()) return;
    if (!quiet) setBusy(true);
    setError("");
    try {
      const data = await request({ action: "gm_bootstrap" });
      const nextInvites = Array.isArray(data.invites) ? data.invites as Invite[] : [];
      setSettings((data.settings as MessageSettings | null) ?? {
        allow_player_to_player: false,
        retention_hours: 168,
        gm_can_read_player_to_player: true,
      });
      setInvites(nextInvites);
      setMessages(Array.isArray(data.messages) ? data.messages as DirectMessage[] : []);
      setSelectedSeat((current) => current ?? nextInvites[0]?.seat ?? null);
      setUnlocked(true);
      rememberGmKey();
      if (!quiet) setStatus("PRIVATE COMMUNICATIONS CHANNEL UNLOCKED");
    } catch (reason) {
      if (!quiet) setUnlocked(false);
      setError(reason instanceof Error ? reason.message : "Unable to unlock private messaging.");
    } finally {
      if (!quiet) setBusy(false);
    }
  }, [gmKey, rememberGmKey, request]);

  useEffect(() => {
    if (!sessionReady || !restoredFromSession || !gmKey.trim() || autoUnlockAttempted.current) return;
    autoUnlockAttempted.current = true;
    void load();
  }, [gmKey, load, restoredFromSession, sessionReady]);

  useEffect(() => {
    if (!unlocked) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 6_000);
    return () => window.clearInterval(timer);
  }, [load, unlocked]);

  const selectedInvite = invites.find((invite) => invite.seat === selectedSeat) ?? null;
  const threadMessages = useMemo(() => messages
    .filter((message) => message.sender_seat === selectedSeat || message.recipient_seat === selectedSeat)
    .toReversed(), [messages, selectedSeat]);
  const unreadBySeat = useMemo(() => {
    const unread = new Map<number, number>();
    for (const message of messages) {
      if (message.sender_kind === "citizen" && message.recipient_kind === "gm" && !message.read_at && message.sender_seat) {
        unread.set(message.sender_seat, (unread.get(message.sender_seat) ?? 0) + 1);
      }
    }
    return unread;
  }, [messages]);

  const markThreadRead = useCallback(async (seat: number) => {
    try {
      await request({ action: "gm_mark_read", senderSeat: seat });
      setMessages((current) => current.map((message) =>
        message.sender_kind === "citizen" && message.sender_seat === seat && message.recipient_kind === "gm"
          ? { ...message, read_at: message.read_at ?? new Date().toISOString() }
          : message));
    } catch {
      // Read receipts are helpful, but a transient receipt failure should not
      // interrupt the GM's ability to read or reply.
    }
  }, [request]);

  const selectThread = (seat: number) => {
    setSelectedSeat(seat);
    if (unreadBySeat.get(seat)) void markThreadRead(seat);
  };

  const issueInvite = async (seat: number) => {
    setBusy(true);
    setError("");
    try {
      const data = await request({ action: "gm_issue_invite", seat });
      const inviteUrl = String(data.inviteUrl ?? "");
      setFreshLinks((current) => ({ ...current, [seat]: inviteUrl }));
      setStatus("NEW 30-DAY INBOX LINK CREATED · PREVIOUS LINK REVOKED");
      await load(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create inbox link.");
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = async (seat: number) => {
    const value = freshLinks[seat];
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setStatus("INBOX LINK COPIED · TREAT IT LIKE A PRIVATE INVITATION");
  };

  const revokeInvite = async (seat: number) => {
    setBusy(true);
    setError("");
    try {
      await request({ action: "gm_revoke_invite", seat });
      setFreshLinks((current) => {
        const next = { ...current };
        delete next[seat];
        return next;
      });
      setStatus("PLAYER INBOX LINK REVOKED");
      await load(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to revoke inbox link.");
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async (patch: Partial<MessageSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    setBusy(true);
    setError("");
    try {
      await request({
        action: "gm_update_settings",
        allowPlayerToPlayer: next.allow_player_to_player,
        retentionHours: next.retention_hours,
      });
      setStatus("MESSAGING SETTINGS SAVED · GM VISIBILITY REMAINS ACTIVE");
    } catch (reason) {
      setSettings(settings);
      setError(reason instanceof Error ? reason.message : "Unable to save messaging settings.");
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!selectedSeat || !draft.trim()) return;
    setBusy(true);
    setError("");
    try {
      await request({ action: "gm_send", recipientSeat: selectedSeat, message: draft });
      setDraft("");
      setStatus(`PRIVATE MESSAGE SENT TO ${selectedInvite?.display_name ?? `SEAT ${selectedSeat}`}`);
      await load(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to send private message.");
    } finally {
      setBusy(false);
    }
  };

  const clearAll = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await request({ action: "gm_delete_all" });
      setMessages([]);
      setConfirmClear(false);
      setStatus(`${Number(data.deleted ?? 0)} ROOM MESSAGES PERMANENTLY DELETED`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to clear room messages.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="control-shell message-shell">
      <header className="control-header">
        <div>
          <span className="control-eyebrow">ALPHA COMPLEX · PRIVATE CHANNELS</span>
          <h1>Private Messaging</h1>
          <p className="message-header-copy">Send private notes to players and review all table messaging. Citizen-to-Citizen traffic is optional, disclosed to players, and always visible to the GM.</p>
        </div>
        <div className="control-header-actions">
          <Link className="display-link" href={`/communications/${encodeURIComponent(room)}`}>CITIZEN DIRECTORY</Link>
          <Link className="display-link" href={`/mission/${encodeURIComponent(room)}`}>MISSION DIRECTOR</Link>
        </div>
      </header>

      <section className="panel message-auth-panel">
        <div className="panel-heading"><span>AUTH</span><h2>GM Authorization</h2></div>
        <div className="message-auth-row">
          <input type="password" autoComplete="off" value={gmKey} onChange={(event) => setGmKey(event.target.value)} placeholder="GM AI passphrase" aria-label="GM authorization passphrase" />
          <button type="button" className="primary-action" disabled={busy || !gmKey.trim()} onClick={() => void load()}>{busy ? "WORKING…" : unlocked ? "REFRESH INBOX" : "UNLOCK MESSAGING"}</button>
        </div>
        {status ? <div className="message-status">{status}</div> : null}
        {error ? <div className="message-error" role="alert">{error}</div> : null}
      </section>

      {unlocked ? (
        <>
          <section className="panel message-policy">
            <div className="panel-heading"><span>VIS</span><h2>Visibility & Retention</h2></div>
            <div className="message-policy-grid">
              <div>
                <strong>GM ↔ CITIZEN</strong>
                <span>Visible to the GM and that Citizen only.</span>
              </div>
              <div>
                <strong>CITIZEN ↔ CITIZEN</strong>
                <span>Visible to both Citizens and the GM. GM oversight is always on.</span>
              </div>
              <label>
                <span>PLAYER-TO-PLAYER</span>
                <button type="button" className={settings.allow_player_to_player ? "is-active" : ""} disabled={busy} onClick={() => void saveSettings({ allow_player_to_player: !settings.allow_player_to_player })}>
                  {settings.allow_player_to_player ? "ENABLED" : "DISABLED"}
                </button>
              </label>
              <label>
                <span>AUTO-DELETE AFTER</span>
                <select value={settings.retention_hours} disabled={busy} onChange={(event) => void saveSettings({ retention_hours: Number(event.target.value) })}>
                  <option value={24}>24 hours</option>
                  <option value={72}>3 days</option>
                  <option value={168}>7 days</option>
                  <option value={336}>14 days</option>
                  <option value={720}>30 days</option>
                </select>
              </label>
            </div>
          </section>

          <div className="message-workspace">
            <aside className="panel message-thread-list" aria-label="Citizen message threads">
              <div className="panel-heading"><span>{invites.length}</span><h2>Citizens</h2></div>
              {invites.length === 0 ? (
                <p className="message-empty">No saved Citizens. Add Citizens in the directory before issuing inbox links.</p>
              ) : invites.map((invite) => (
                <button type="button" key={invite.seat} className={`message-thread-button${selectedSeat === invite.seat ? " is-active" : ""}`} onClick={() => selectThread(invite.seat)}>
                  <span className="message-thread-avatar">{invite.seat}</span>
                  <span><strong>{invite.display_name}</strong><small>{invite.citizen_id}</small></span>
                  {unreadBySeat.get(invite.seat) ? <b>{unreadBySeat.get(invite.seat)}</b> : null}
                </button>
              ))}
            </aside>

            <section className="panel message-conversation">
              {selectedInvite ? (
                <>
                  <header className="message-conversation-header">
                    <div><span>PRIVATE CHANNEL · SEAT {selectedInvite.seat}</span><h2>{selectedInvite.display_name}</h2><small>{selectedInvite.citizen_id}</small></div>
                    <div className="message-invite-actions">
                      <button type="button" disabled={busy} onClick={() => void issueInvite(selectedInvite.seat)}>{selectedInvite.invite_active ? "REGENERATE LINK" : "CREATE INBOX LINK"}</button>
                      {freshLinks[selectedInvite.seat] ? <button type="button" className="primary-action" onClick={() => void copyInvite(selectedInvite.seat)}>COPY LINK</button> : null}
                      {selectedInvite.invite_active ? <button type="button" className="danger" disabled={busy} onClick={() => void revokeInvite(selectedInvite.seat)}>REVOKE</button> : null}
                    </div>
                  </header>

                  <div className="message-invite-state">
                    <span className={selectedInvite.invite_active ? "is-live" : ""}>{selectedInvite.invite_active ? "LINK ACTIVE" : "NO ACTIVE LINK"}</span>
                    <small>LAST OPENED {relativeTime(selectedInvite.last_seen_at)}{selectedInvite.expires_at ? ` · EXPIRES ${new Date(selectedInvite.expires_at).toLocaleDateString()}` : ""}</small>
                  </div>

                  <div className="message-feed" aria-live="polite">
                    {threadMessages.length === 0 ? <p className="message-empty">No messages yet. Create an inbox link, send it privately, then begin the channel.</p> : threadMessages.map((message) => {
                      const outgoing = message.sender_kind === "gm";
                      const observedPlayerTraffic = message.sender_kind === "citizen" && message.recipient_kind === "citizen";
                      const routeLabel = observedPlayerTraffic ? `${message.sender_name} → ${message.recipient_name}` : outgoing ? "GM" : message.sender_name;
                      return (
                        <article key={message.id} className={`message-bubble${outgoing ? " message-bubble--outgoing" : ""}${observedPlayerTraffic ? " message-bubble--observed" : ""}`}>
                          <strong>{routeLabel}</strong>
                          <p>{message.body}</p>
                          <small>{observedPlayerTraffic ? "TABLE TRAFFIC · " : ""}{new Date(message.created_at).toLocaleString()} · {deliveryState(message, observedPlayerTraffic)}</small>
                        </article>
                      );
                    })}
                  </div>

                  <div className="message-quick-row">{QUICK_MESSAGES.map((message) => <button type="button" key={message} onClick={() => setDraft(message)}>{message}</button>)}</div>
                  <div className="message-composer">
                    <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder={`Private message to ${selectedInvite.display_name}`} aria-label={`Private message to ${selectedInvite.display_name}`} />
                    <div><small>{draft.length} / 2000</small><button type="button" className="primary-action" disabled={busy || !draft.trim()} onClick={() => void send()}>SEND PRIVATELY</button></div>
                  </div>
                </>
              ) : <p className="message-empty">Select a Citizen to open a private channel.</p>}
            </section>
          </div>

          <section className="panel message-danger-zone">
            <div><strong>ROOM MESSAGE PURGE</strong><span>Invite links remain active; every stored message in this room is deleted.</span></div>
            <button type="button" className="danger" disabled={busy} onClick={() => void clearAll()}>{confirmClear ? "CONFIRM PERMANENT DELETE" : "CLEAR ALL MESSAGES"}</button>
          </section>
        </>
      ) : null}
    </main>
  );
}
