"use client";

import { useState } from "react";

type InviteMode = "display" | "join";

export function DeviceInvitePanel({ room }: { room: string }) {
  const [gmKey, setGmKey] = useState("");
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<InviteMode>("display");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function sendInvite() {
    if (!gmKey.trim() || !email.trim()) return;
    setBusy(true);
    setStatus("");
    setError("");
    try {
      const response = await fetch("/api/invites/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-friend-computer-gm-key": gmKey,
        },
        body: JSON.stringify({ room, email, mode }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Device invitation failed.");
      setStatus(`INVITATION SENT · ${mode === "display" ? "DISPLAY TERMINAL" : "GM JOIN MENU"}`);
      setEmail("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to send device invitation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" style={{ gridColumn: "1 / -1" }}>
      <div className="panel-heading"><span>07</span><h2>Invite Device</h2></div>
      <div style={{ display: "grid", gap: 9 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8 }}>
          <input type="password" autoComplete="off" value={gmKey} onChange={(event) => setGmKey(event.target.value)} placeholder="GM passphrase" aria-label="GM passphrase for invitation" />
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email to open on device" aria-label="Device invitation email" />
        </div>
        <div className="button-row" style={{ marginTop: 0 }}>
          <button type="button" className={mode === "display" ? "is-active" : ""} onClick={() => setMode("display")}>DISPLAY TERMINAL</button>
          <button type="button" className={mode === "join" ? "is-active" : ""} onClick={() => setMode("join")}>GM JOIN MENU</button>
          <button type="button" className="primary-action" disabled={busy || !gmKey.trim() || !email.trim()} onClick={() => void sendInvite()}>{busy ? "SENDING…" : "SEND INVITE"}</button>
        </div>
        {status ? <div style={{ color: "#87f6fb", fontSize: 12 }}>{status}</div> : null}
        {error ? <div style={{ color: "#ff8d86", fontSize: 12 }}>{error}</div> : null}
        <small style={{ color: "#6e9499", lineHeight: 1.45 }}>DISPLAY TERMINAL opens this room directly on Friend Computer and lets that device choose its local display name plus PRIMARY AUDIO / VISUAL ONLY role. GM JOIN MENU opens the room checkpoint. No GM passphrase is included in either link.</small>
      </div>
    </section>
  );
}
