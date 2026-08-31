"use client";

import { useState } from "react";
import { useGmSession } from "@/lib/gm-session";

type InviteMode = "display" | "join";

export function DeviceInvitePanel({ room }: { room: string }) {
  const [open, setOpen] = useState(false);
  const { gmKey, setGmKey, rememberGmKey } = useGmSession();
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
      rememberGmKey();
      setStatus(`INVITATION SENT · ${mode === "display" ? "DISPLAY TERMINAL" : "GM JOIN MENU"}`);
      setEmail("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to send device invitation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          left: 16,
          bottom: 16,
          zIndex: 90,
          padding: "10px 13px",
          border: "1px solid #27646a",
          background: "#071214",
          color: "#9cf5f8",
          font: "700 11px 'Courier New', monospace",
          letterSpacing: ".08em",
          cursor: "pointer",
          boxShadow: "0 0 24px rgba(72,246,255,.08)",
        }}
      >
        ✉ INVITE DEVICE
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Invite device"
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 140, display: "grid", placeItems: "center", padding: 20, background: "rgba(0,5,6,.88)", backdropFilter: "blur(7px)" }}
        >
          <div className="panel" onClick={(event) => event.stopPropagation()} style={{ width: "min(620px,95vw)", margin: 0 }}>
            <div className="panel-heading"><span>✉</span><h2>Invite Device</h2></div>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ color: "#8fbfc3", fontSize: 12 }}>ROOM {room.toUpperCase()}</div>
              <input type="password" autoComplete="off" value={gmKey} onChange={(event) => setGmKey(event.target.value)} placeholder="GM passphrase" aria-label="GM passphrase for invitation" />
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email to open on device" aria-label="Device invitation email" />
              <div className="button-row" style={{ marginTop: 0 }}>
                <button type="button" className={mode === "display" ? "is-active" : ""} onClick={() => setMode("display")}>DISPLAY TERMINAL</button>
                <button type="button" className={mode === "join" ? "is-active" : ""} onClick={() => setMode("join")}>GM JOIN MENU</button>
              </div>
              <button type="button" className="primary-action" disabled={busy || !gmKey.trim() || !email.trim()} onClick={() => void sendInvite()}>{busy ? "SENDING…" : "SEND INVITE VIA RESEND"}</button>
              {status ? <div style={{ color: "#87f6fb", fontSize: 12 }}>{status}</div> : null}
              {error ? <div style={{ color: "#ff8d86", fontSize: 12 }}>{error}</div> : null}
              <small style={{ color: "#6e9499", lineHeight: 1.45 }}>DISPLAY TERMINAL opens Friend Computer directly and lets the device choose its local display name plus PRIMARY AUDIO / VISUAL ONLY role. GM JOIN MENU opens the room checkpoint. The email contains no GM passphrase.</small>
              <button type="button" onClick={() => setOpen(false)}>CLOSE</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
