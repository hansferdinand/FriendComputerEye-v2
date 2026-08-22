"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EXPRESSIONS,
  PLAYER_PRESETS,
  THREAT_LEVELS,
  type Expression,
  type FriendCommand,
  type FriendEffect,
  type ThreatLevel,
} from "@/lib/friend-computer";

type ConnectionState = "locked" | "connecting" | "connected" | "error";

type PendingAction = {
  callId: string;
  name: string;
  label: string;
  commands: FriendCommand[];
};

type Props = {
  room: string;
  playerNames: string[];
  displayOnline: boolean;
  sendCommand: (command: FriendCommand) => void;
};

const SAFE_EFFECTS: FriendEffect[] = [
  "blink",
  "double-blink",
  "glitch",
  "degauss",
  "clone",
  "random-ad",
  "happy-ad",
  "interrogation",
  "drugged",
];

function parseArguments(raw: unknown) {
  if (typeof raw !== "string") return {} as Record<string, unknown>;
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {} as Record<string, unknown>;
  }
}

function transcriptFromItem(item: Record<string, unknown>) {
  const content = Array.isArray(item.content) ? item.content : [];
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const value = part as Record<string, unknown>;
      if (typeof value.text === "string") return value.text;
      if (typeof value.transcript === "string") return value.transcript;
      return "";
    })
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function AICopilotPanel({ room, playerNames, displayOnline, sendCommand }: Props) {
  const [gmKey, setGmKey] = useState("");
  const [connection, setConnection] = useState<ConnectionState>("locked");
  const [model, setModel] = useState("gpt-realtime-2.1");
  const [error, setError] = useState("");
  const [micLive, setMicLive] = useState(false);
  const [autoActions, setAutoActions] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [prompt, setPrompt] = useState("");
  const [lastReply, setLastReply] = useState("Friend Computer is awaiting authorization.");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoActionsRef = useRef(false);
  const pendingRef = useRef<PendingAction | null>(null);
  const playerNamesRef = useRef(playerNames);

  useEffect(() => {
    autoActionsRef.current = autoActions;
  }, [autoActions]);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    playerNamesRef.current = playerNames;
  }, [playerNames]);

  const disconnect = useCallback(() => {
    dcRef.current?.close();
    pcRef.current?.close();
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }
    dcRef.current = null;
    pcRef.current = null;
    streamRef.current = null;
    audioRef.current = null;
    setMicLive(false);
    setPending(null);
    setConnection("locked");
  }, []);

  useEffect(() => () => disconnect(), [disconnect]);

  const functionResult = useCallback((callId: string, result: Record<string, unknown>) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return;
    dc.send(JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(result),
      },
    }));
    dc.send(JSON.stringify({ type: "response.create" }));
  }, []);

  const resolveTool = useCallback((name: string, rawArguments: unknown, callId: string): PendingAction | null => {
    const args = parseArguments(rawArguments);

    if (name === "set_expression") {
      const expression = args.expression;
      if (typeof expression !== "string" || !EXPRESSIONS.includes(expression as Expression)) return null;
      const rawIntensity = typeof args.intensity === "number" ? args.intensity : 0.82;
      const intensity = Math.max(0, Math.min(1, rawIntensity));
      return {
        callId,
        name,
        label: `Expression → ${expression.toUpperCase()} (${Math.round(intensity * 100)}%)`,
        commands: [{ type: "set-expression", expression: expression as Expression, intensity }],
      };
    }

    if (name === "set_threat") {
      const level = args.level;
      if (typeof level !== "string" || !THREAT_LEVELS.includes(level as ThreatLevel)) return null;
      return {
        callId,
        name,
        label: `Threat → ${level}`,
        commands: [{ type: "set-threat", level: level as ThreatLevel }],
      };
    }

    if (name === "focus_citizen") {
      const seat = args.seat;
      if (typeof seat !== "number" || !Number.isInteger(seat) || seat < 0 || seat > 4) return null;
      if (seat === 0) {
        return {
          callId,
          name,
          label: "Gaze → CENTER",
          commands: [{ type: "set-gaze", x: 0, y: 0, target: "CENTER" }],
        };
      }
      const preset = PLAYER_PRESETS[seat - 1];
      const target = playerNamesRef.current[seat - 1] || preset.label;
      return {
        callId,
        name,
        label: `Watch → ${target}`,
        commands: [{ type: "set-gaze", x: preset.x, y: preset.y, target }],
      };
    }

    if (name === "show_effect") {
      const effect = args.effect;
      if (typeof effect !== "string" || !SAFE_EFFECTS.includes(effect as FriendEffect)) return null;
      return {
        callId,
        name,
        label: `Effect → ${effect.toUpperCase()}`,
        commands: [{ type: "effect", effect: effect as FriendEffect }],
      };
    }

    if (name === "set_status") {
      if (typeof args.text !== "string") return null;
      const text = args.text.replace(/[\r\n\t]+/g, " ").trim().slice(0, 120);
      if (!text) return null;
      return {
        callId,
        name,
        label: `Status → “${text}”`,
        commands: [{ type: "set-status", text }],
      };
    }

    if (name === "set_patrol") {
      if (typeof args.enabled !== "boolean") return null;
      return {
        callId,
        name,
        label: args.enabled ? "Begin citizen patrol" : "Stop citizen patrol",
        commands: [{ type: "set-patrol", enabled: args.enabled }],
      };
    }

    return null;
  }, []);

  const executeAction = useCallback((action: PendingAction) => {
    for (const command of action.commands) sendCommand(command);
    functionResult(action.callId, { ok: true, executed: true, display_online: displayOnline });
    setPending(null);
  }, [displayOnline, functionResult, sendCommand]);

  const handleEvent = useCallback((raw: string) => {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    if (event.type === "error") {
      setError("OpenAI Realtime reported a session error.");
      return;
    }

    if (event.type !== "response.output_item.done" || !event.item || typeof event.item !== "object") return;
    const item = event.item as Record<string, unknown>;

    if (item.type === "message") {
      const transcript = transcriptFromItem(item);
      if (transcript) setLastReply(transcript);
      return;
    }

    if (item.type !== "function_call") return;
    const callId = typeof item.call_id === "string" ? item.call_id : "";
    const name = typeof item.name === "string" ? item.name : "";
    if (!callId || !name) return;

    const action = resolveTool(name, item.arguments, callId);
    if (!action) {
      functionResult(callId, { ok: false, error: "invalid_or_disallowed_arguments" });
      return;
    }

    if (autoActionsRef.current) {
      executeAction(action);
      return;
    }

    if (pendingRef.current) {
      functionResult(callId, { ok: false, error: "another_action_is_awaiting_gm_approval" });
      return;
    }

    pendingRef.current = action;
    setPending(action);
  }, [executeAction, functionResult, resolveTool]);

  const connect = useCallback(async () => {
    if (!gmKey.trim() || connection === "connecting") return;
    disconnect();
    setConnection("connecting");
    setError("");

    try {
      const tokenResponse = await fetch("/api/realtime-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-friend-computer-gm-key": gmKey,
        },
        body: JSON.stringify({ room, playerNames }),
      });
      const tokenData = (await tokenResponse.json()) as { value?: string; model?: string; error?: string };
      if (!tokenResponse.ok || !tokenData.value) {
        throw new Error(tokenData.error || "Friend Computer refused AI authorization.");
      }
      if (tokenData.model) setModel(tokenData.model);

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audio = document.createElement("audio");
      audio.autoplay = true;
      audioRef.current = audio;
      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0];
        void audio.play().catch(() => undefined);
      };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const micTrack = stream.getAudioTracks()[0];
      if (!micTrack) throw new Error("No microphone audio track was available.");
      micTrack.enabled = false;
      pc.addTrack(micTrack, stream);

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.addEventListener("message", (event) => {
        if (typeof event.data === "string") handleEvent(event.data);
      });
      dc.addEventListener("open", () => setConnection("connected"));
      dc.addEventListener("close", () => {
        setMicLive(false);
        setConnection("locked");
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${tokenData.value}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!sdpResponse.ok) throw new Error(`Realtime WebRTC negotiation failed (${sdpResponse.status}).`);

      await pc.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });
    } catch (reason) {
      disconnect();
      setConnection("error");
      setError(reason instanceof Error ? reason.message : "Unable to start Friend Computer AI.");
    }
  }, [connection, disconnect, gmKey, handleEvent, playerNames, room]);

  const toggleMic = useCallback(() => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicLive(track.enabled);
  }, []);

  const sendPrompt = useCallback(() => {
    const text = prompt.trim();
    const dc = dcRef.current;
    if (!text || !dc || dc.readyState !== "open") return;
    dc.send(JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    }));
    dc.send(JSON.stringify({ type: "response.create" }));
    setPrompt("");
  }, [prompt]);

  const statusLabel =
    connection === "connected"
      ? micLive
        ? "CONNECTED · MIC LIVE"
        : "CONNECTED · MIC MUTED"
      : connection === "connecting"
        ? "CONNECTING TO OPENAI"
        : connection === "error"
          ? "AI CONNECTION ERROR"
          : "AI LOCKED";

  return (
    <section className="panel" style={{ gridColumn: "1 / -1" }}>
      <div className="panel-heading"><span>AI</span><h2>Friend Computer Copilot</h2></div>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <strong style={{ color: connection === "connected" ? "#70ff9a" : "#8fbfc3", fontSize: 12 }}>{statusLabel}</strong>
          <small style={{ color: "#6e9499" }}>{model} · display {displayOnline ? "online" : "not detected"}</small>
        </div>

        {connection !== "connected" ? (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 }}>
            <input
              type="password"
              autoComplete="off"
              value={gmKey}
              onChange={(event) => setGmKey(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void connect(); }}
              placeholder="GM AI passphrase"
              aria-label="Friend Computer GM AI passphrase"
            />
            <button type="button" className="primary-action" style={{ marginTop: 0 }} onClick={() => void connect()}>
              CONNECT AI
            </button>
          </div>
        ) : (
          <div className="button-row" style={{ marginTop: 0 }}>
            <button type="button" className={micLive ? "is-active" : ""} onClick={toggleMic}>{micLive ? "MUTE MIC" : "ARM MIC"}</button>
            <button
              type="button"
              className={autoActions ? "danger is-active" : ""}
              onClick={() => setAutoActions((value) => !value)}
              title="Off means every AI display action waits for GM approval."
            >
              AUTO ACTIONS {autoActions ? "ON" : "OFF"}
            </button>
            <button type="button" onClick={disconnect}>DISCONNECT AI</button>
          </div>
        )}

        {error ? <div style={{ color: "#ff8d86", fontSize: 12 }}>{error}</div> : null}

        {pending ? (
          <div style={{ border: "1px solid #806b26", padding: 12, background: "#151207" }}>
            <div style={{ color: "#ffe36c", fontWeight: 800, marginBottom: 8 }}>AI REQUESTS GM AUTHORIZATION</div>
            <div style={{ color: "#d9fbfd", marginBottom: 10 }}>{pending.label}</div>
            <div className="button-row" style={{ marginTop: 0 }}>
              <button type="button" className="is-active" onClick={() => executeAction(pending)}>APPROVE</button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  functionResult(pending.callId, { ok: false, executed: false, reason: "gm_denied" });
                  setPending(null);
                }}
              >
                DENY
              </button>
            </div>
          </div>
        ) : null}

        <div style={{ border: "1px solid #1e4347", padding: 10, minHeight: 58, color: "#aeecef", lineHeight: 1.45 }}>
          <small style={{ display: "block", color: "#6e9499", marginBottom: 5 }}>LATEST COMPUTER RESPONSE</small>
          {lastReply}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 }}>
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") sendPrompt(); }}
            placeholder="Text prompt to Friend Computer (useful for quiet testing)..."
            disabled={connection !== "connected"}
          />
          <button type="button" onClick={sendPrompt} disabled={connection !== "connected"}>SEND TO AI</button>
        </div>

        <small style={{ color: "#6e9499", lineHeight: 1.4 }}>
          Copilot mode is the default. Microphone starts muted. The OpenAI API key stays server-side; this browser receives only a short-lived Realtime credential after GM authorization.
        </small>
      </div>
    </section>
  );
}
