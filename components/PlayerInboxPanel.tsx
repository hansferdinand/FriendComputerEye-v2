"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Identity = {
  room: string;
  seat: number;
  citizen_id: string;
  display_name: string;
  allow_player_to_player: boolean;
  retention_hours: number;
  gm_can_read_player_to_player: boolean;
  expires_at: string;
};

type DirectoryCitizen = { seat: number; citizen_id: string; display_name: string };

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

type Recipient = { kind: "gm" | "citizen"; seat: number | null; label: string; detail: string };

export function PlayerInboxPanel({ token }: { token: string }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [directory, setDirectory] = useState<DirectoryCitizen[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [selectedKey, setSelectedKey] = useState("gm");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const request = useCallback(async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-friend-computer-participant-token": token,
      },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Inbox request failed.");
    return data;
  }, [token]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setBusy(true);
    try {
      const data = await request({ action: "player_bootstrap" });
      setIdentity(data.identity as Identity);
      setDirectory(Array.isArray(data.directory) ? data.directory as DirectoryCitizen[] : []);
      setMessages(Array.isArray(data.messages) ? data.messages as DirectMessage[] : []);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load this inbox.");
    } finally {
      if (!quiet) setBusy(false);
    }
  }, [request]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!identity) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 6_000);
    return () => window.clearInterval(timer);
  }, [identity, load]);

  const recipients = useMemo<Recipient[]>(() => [
    { kind: "gm", seat: null, label: "Game Master", detail: "Private GM channel" },
    ...directory.map((citizen) => ({ kind: "citizen" as const, seat: citizen.seat, label: citizen.display_name, detail: citizen.citizen_id })),
  ], [directory]);
  const selected = recipients.find((recipient) => selectedKey === (recipient.kind === "gm" ? "gm" : `citizen:${recipient.seat}`)) ?? recipients[0];

  const threadMessages = useMemo(() => {
    if (!identity || !selected) return [];
    return messages.filter((message) => {
      if (selected.kind === "gm") return message.sender_kind === "gm" || message.recipient_kind === "gm";
      return (message.sender_seat === selected.seat || message.recipient_seat === selected.seat)
        && message.sender_kind === "citizen" && message.recipient_kind === "citizen";
    }).toReversed();
  }, [identity, messages, selected]);

  const unreadFor = useCallback((recipient: Recipient) => messages.filter((message) => {
    if (message.read_at || !identity || message.recipient_seat !== identity.seat) return false;
    if (recipient.kind === "gm") return message.sender_kind === "gm";
    return message.sender_kind === "citizen" && message.sender_seat === recipient.seat;
  }).length, [identity, messages]);

  const markRead = async (recipient: Recipient) => {
    try {
      await request({ action: "player_mark_read", senderKind: recipient.kind, senderSeat: recipient.seat });
      setMessages((current) => current.map((message) => {
        if (!identity || message.recipient_seat !== identity.seat) return message;
        const matches = recipient.kind === "gm"
          ? message.sender_kind === "gm"
          : message.sender_kind === "citizen" && message.sender_seat === recipient.seat;
        return matches ? { ...message, read_at: message.read_at ?? new Date().toISOString() } : message;
      }));
    } catch {
      // Do not block the inbox if only the read receipt fails.
    }
  };

  const chooseRecipient = (recipient: Recipient) => {
    setSelectedKey(recipient.kind === "gm" ? "gm" : `citizen:${recipient.seat}`);
    if (unreadFor(recipient)) void markRead(recipient);
  };

  const send = async () => {
    if (!selected || !draft.trim()) return;
    setBusy(true);
    try {
      await request({
        action: "player_send",
        recipientKind: selected.kind,
        recipientSeat: selected.seat,
        message: draft,
      });
      setDraft("");
      await load(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to send private message.");
    } finally {
      setBusy(false);
    }
  };

  if (busy && !identity && !error) {
    return <main className="player-inbox-shell"><div className="player-inbox-loading"><span>FRIEND COMPUTER</span><strong>VERIFYING PRIVATE CHANNEL…</strong></div></main>;
  }

  if (!identity) {
    return <main className="player-inbox-shell"><section className="player-inbox-invalid"><span>CHANNEL UNAVAILABLE</span><h1>Private Inbox Link Rejected</h1><p>{error || "This link is invalid, expired, or revoked."}</p><small>Ask your GM for a new private inbox link.</small></section></main>;
  }

  return (
    <main className="player-inbox-shell">
      <header className="player-inbox-header">
        <div><span>FRIEND COMPUTER PRIVATE NETWORK</span><h1>{identity.display_name}</h1><small>{identity.citizen_id} · ROOM {identity.room.toUpperCase()}</small></div>
        <button type="button" onClick={() => void load()} disabled={busy}>↻ REFRESH</button>
      </header>

      <div className="player-inbox-policy">
        <strong>TABLE VISIBILITY NOTICE</strong>
        <span>Every message sent through this table app is visible to the GM. Direct Citizen messages remain visible only to the sender, recipient, and GM. Messages auto-delete after {Math.round(identity.retention_hours / 24)} day(s).</span>
      </div>
      {error ? <div className="player-inbox-error" role="alert">{error}</div> : null}

      <div className="player-inbox-layout">
        <nav className="player-recipient-list" aria-label="Private conversations">
          {recipients.map((recipient) => {
            const key = recipient.kind === "gm" ? "gm" : `citizen:${recipient.seat}`;
            const unread = unreadFor(recipient);
            return <button type="button" className={selectedKey === key ? "is-active" : ""} key={key} onClick={() => chooseRecipient(recipient)}><span>{recipient.kind === "gm" ? "FC" : recipient.seat}</span><span><strong>{recipient.label}</strong><small>{recipient.detail}</small></span>{unread ? <b>{unread}</b> : null}</button>;
          })}
        </nav>

        <section className="player-conversation">
          <header><span>{selected.kind === "gm" ? "GM CHANNEL" : "DIRECT CITIZEN CHANNEL"}</span><h2>{selected.label}</h2></header>
          <div className="player-message-feed" aria-live="polite">
            {threadMessages.length === 0 ? <p>No messages in this channel yet.</p> : threadMessages.map((message) => {
              const outgoing = message.sender_kind === "citizen" && message.sender_seat === identity.seat;
              return <article key={message.id} className={outgoing ? "is-outgoing" : ""}><strong>{outgoing ? "YOU" : message.sender_name}</strong><p>{message.body}</p><small>{new Date(message.created_at).toLocaleString()} · {outgoing ? message.read_at ? "READ" : "SENT" : "RECEIVED"}</small></article>;
            })}
          </div>
          <div className="player-message-composer">
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder={`Message ${selected.label}`} aria-label={`Message ${selected.label}`} />
            <div><small>{draft.length} / 2000</small><button type="button" disabled={busy || !draft.trim()} onClick={() => void send()}>SEND PRIVATE MESSAGE</button></div>
          </div>
        </section>
      </div>
    </main>
  );
}
