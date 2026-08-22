"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PLAYER_PRESETS, type FriendCommand } from "@/lib/friend-computer";
import { createCommandBus, type CommandBus, type RoomPresence } from "@/lib/transport";

const PLAYER_STORAGE_KEY = "friend-computer-v2:player-names:v1";

type HistoryItem = { role: "user" | "assistant"; text: string };
type Proposal = { label: string; command: FriendCommand };
type CopilotResponse = { reply?: string; proposal?: Proposal | null; model?: string; error?: string };

function readPlayerNames() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PLAYER_STORAGE_KEY) ?? "null") as unknown;
    if (Array.isArray(saved) && saved.length === PLAYER_PRESETS.length && saved.every((item) => typeof item === "string")) {
      return saved as string[];
    }
  } catch {
    // Defaults are fine if storage is unavailable.
  }
  return PLAYER_PRESETS.map((preset) => preset.label);
}

export function TextCopilotPanel({ room }: { room: string }) {
  const busRef = useRef<CommandBus | null>(null);
  const [transport, setTransport] = useState<CommandBus["transport"]>("connecting");
  const [presence, setPresence] = useState<RoomPresence>({ displays: 0, controls: 0 });
  const [playerNames, setPlayerNames] = useState<string[]>(() => PLAYER_PRESETS.map((preset) => preset.label));
  const [gmKey, setGmKey] = useState("");
  const [prompt, setPrompt] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [pending, setPending] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [model, setModel] = useState("gpt-5.6-terra");

  useEffect(() => {
    setPlayerNames(readPlayerNames());
    const bus = createCommandBus(room, undefined, setTransport, setPresence);
    busRef.current = bus;
    return () => {
      bus.close();
      busRef.current = null;
    };
  }, [room]);

  const askComputer = useCallback(async () => {
    const text = prompt.trim();
    if (!text || !gmKey.trim() || loading) return;
    setLoading(true);
    setError("");
    setPending(null);

    try {
      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-friend-computer-gm-key": gmKey,
        },
        body: JSON.stringify({ room, prompt: text, playerNames, history }),
      });
      const data = (await response.json()) as CopilotResponse;
      if (!response.ok || !data.reply) throw new Error(data.error || "Friend Computer declined to answer.");

      if (data.model) setModel(data.model);
      const additions: HistoryItem[] = [
        { role: "user", text },
        { role: "assistant", text: data.reply },
      ];
      setHistory((current) => [...current, ...additions].slice(-8));
      setPending(data.proposal ?? null);
      setPrompt("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to reach Friend Computer.");
    } finally {
      setLoading(false);
    }
  }, [gmKey, history, loading, playerNames, prompt, room]);

  const approve = useCallback(() => {
    if (!pending) return;
    busRef.current?.send(pending.command);
    setPending(null);
  }, [pending]);

  const displayOnline = transport === "realtime" && presence.displays > 0;
  const latestReply = [...history].reverse().find((item) => item.role === "assistant")?.text ?? "Friend Computer is awaiting a properly authorized inquiry.";

  return (
    <main className="control-shell">
      <header className="control-header">
        <div>
          <span className="control-eyebrow">EXPERIMENTAL GM AI TERMINAL</span>
          <h1>Friend Computer Copilot</h1>
        </div>
        <div className="control-header-actions">
          <Link className="display-link" href={`/control/${encodeURIComponent(room)}`}>MANUAL CONTROLS</Link>
          <Link className="display-link" href={`/display/${encodeURIComponent(room)}`} target="_blank">OPEN DISPLAY ↗</Link>
          <div className={`connection-pill ${displayOnline ? "" : "connection-pill--warning"}`}><i /> {displayOnline ? "DISPLAY ONLINE" : "DISPLAY NOT DETECTED"}</div>
        </div>
      </header>

      <div className="control-grid">
        <section className="panel" style={{ gridColumn: "1 / -1" }}>
          <div className="panel-heading"><span>AI</span><h2>Text Copilot</h2></div>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <strong style={{ color: "#8fbfc3", fontSize: 12 }}>{model}</strong>
              <small style={{ color: "#6e9499" }}>SERVER-SIDE RESPONSES API · GM APPROVAL REQUIRED</small>
            </div>

            <input
              type="password"
              autoComplete="off"
              value={gmKey}
              onChange={(event) => setGmKey(event.target.value)}
              placeholder="GM AI passphrase"
              aria-label="Friend Computer GM AI passphrase"
            />

            <div style={{ border: "1px solid #1e4347", padding: 12, minHeight: 86, color: "#aeecef", lineHeight: 1.5 }}>
              <small style={{ display: "block", color: "#6e9499", marginBottom: 6 }}>LATEST COMPUTER RESPONSE</small>
              {latestReply}
            </div>

            {pending ? (
              <div style={{ border: "1px solid #806b26", padding: 12, background: "#151207" }}>
                <div style={{ color: "#ffe36c", fontWeight: 800, marginBottom: 8 }}>AI REQUESTS GM AUTHORIZATION</div>
                <div style={{ color: "#d9fbfd", marginBottom: 10 }}>{pending.label}</div>
                <div className="button-row" style={{ marginTop: 0 }}>
                  <button type="button" className="is-active" onClick={approve}>APPROVE</button>
                  <button type="button" className="danger" onClick={() => setPending(null)}>DENY</button>
                </div>
              </div>
            ) : null}

            {error ? <div style={{ color: "#ff8d86", fontSize: 12 }}>{error}</div> : null}

            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void askComputer();
              }}
              placeholder="Citizen 2 claims the unauthorized laser discharge was caused by poor maintenance. Respond as Friend Computer..."
              style={{ minHeight: 110 }}
            />
            <button type="button" className="primary-action" disabled={loading || !gmKey.trim() || !prompt.trim()} onClick={() => void askComputer()}>
              {loading ? "CONSULTING FRIEND COMPUTER…" : "ASK FRIEND COMPUTER"}
            </button>

            <small style={{ color: "#6e9499", lineHeight: 1.45 }}>
              Text-only safety slice. No microphone, WebRTC, or Realtime client code loads on this page. Friend Computer may propose one display action per response; nothing executes until you approve it.
            </small>
          </div>
        </section>
      </div>
    </main>
  );
}
