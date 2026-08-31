"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PLAYER_PRESETS, type FriendCommand } from "@/lib/friend-computer";
import { useGmSession } from "@/lib/gm-session";
import { createCommandBus, type CommandBus, type RoomPresence } from "@/lib/transport";

const PLAYER_STORAGE_KEY = "friend-computer-v2:player-names:v1";
const MAX_LISTEN_MS = 45_000;
const RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

type HistoryItem = { role: "user" | "assistant"; text: string };
type Proposal = { label: string; command: FriendCommand };
type SenderPersona =
  | "friend_computer"
  | "citizen_services"
  | "internal_security"
  | "happiness_office"
  | "termination_services";
type NoticeProposal = {
  seat: number;
  citizenId: string;
  displayName: string;
  senderPersona: SenderPersona;
  noticeKind: string;
  subject: string;
  body: string;
  includeResponse: boolean;
};
type CopilotResponse = {
  reply?: string;
  proposal?: Proposal | null;
  noticeProposal?: NoticeProposal | null;
  model?: string;
  error?: string;
};
type TranscribeResponse = { text?: string; model?: string; error?: string };

const SENDER_LABELS: Record<SenderPersona, string> = {
  friend_computer: "Friend Computer",
  citizen_services: "Citizen Services",
  internal_security: "Internal Security",
  happiness_office: "Happiness Office",
  termination_services: "Termination Services",
};

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

function preferredRecorderMime() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
  return RECORDER_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function extensionForMime(mimeType: string) {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName);
}

export function TextCopilotPanel({ room }: { room: string }) {
  const busRef = useRef<CommandBus | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const listenHeldRef = useRef(false);
  const listenStartedAtRef = useRef(0);
  const listenTimeoutRef = useRef<number | null>(null);

  const [transport, setTransport] = useState<CommandBus["transport"]>("connecting");
  const [presence, setPresence] = useState<RoomPresence>({ displays: 0, controls: 0 });
  const [playerNames, setPlayerNames] = useState<string[]>(() => PLAYER_PRESETS.map((preset) => preset.label));
  const { gmKey, setGmKey, rememberGmKey } = useGmSession();
  const [prompt, setPrompt] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [pending, setPending] = useState<Proposal | null>(null);
  const [pendingNotice, setPendingNotice] = useState<NoticeProposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [noticeSending, setNoticeSending] = useState(false);
  const [noticeStatus, setNoticeStatus] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [error, setError] = useState("");
  const [model, setModel] = useState("gpt-5.6-terra");
  const [transcriptionModel, setTranscriptionModel] = useState("gpt-4o-mini-transcribe");
  const [autoSpeak, setAutoSpeak] = useState(true);

  useEffect(() => {
    setPlayerNames(readPlayerNames());
    const bus = createCommandBus(room, undefined, setTransport, setPresence);
    busRef.current = bus;
    return () => {
      bus.close();
      busRef.current = null;
    };
  }, [room]);

  useEffect(() => {
    return () => {
      listenHeldRef.current = false;
      if (listenTimeoutRef.current) window.clearTimeout(listenTimeoutRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
      streamRef.current = null;
    };
  }, []);

  const sendSpeech = useCallback((text: string) => {
    const cleaned = text.trim();
    if (!cleaned) return;
    busRef.current?.send({ type: "speak", text: cleaned });
  }, []);

  const submitPrompt = useCallback(async (textValue: string) => {
    const text = textValue.trim();
    if (!text || !gmKey.trim() || loading) return false;
    setLoading(true);
    setError("");
    setPending(null);
    setPendingNotice(null);
    setNoticeStatus("");

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
      rememberGmKey();

      if (data.model) setModel(data.model);
      const additions: HistoryItem[] = [
        { role: "user", text },
        { role: "assistant", text: data.reply },
      ];
      setHistory((current) => [...current, ...additions].slice(-8));
      setPending(data.proposal ?? null);
      setPendingNotice(data.noticeProposal ?? null);
      setPrompt("");
      if (autoSpeak) sendSpeech(data.reply);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to reach Friend Computer.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [autoSpeak, gmKey, history, loading, playerNames, rememberGmKey, room, sendSpeech]);

  const askComputer = useCallback(async () => {
    await submitPrompt(prompt);
  }, [prompt, submitPrompt]);

  const sendNotice = useCallback(async () => {
    if (!pendingNotice || noticeSending || !gmKey.trim()) return;
    setNoticeSending(true);
    setNoticeStatus("");
    setError("");
    try {
      const response = await fetch("/api/notices/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-friend-computer-gm-key": gmKey,
        },
        body: JSON.stringify({
          room,
          seat: pendingNotice.seat,
          senderPersona: pendingNotice.senderPersona,
          noticeKind: pendingNotice.noticeKind,
          subject: pendingNotice.subject,
          body: pendingNotice.body,
          includeResponse: pendingNotice.includeResponse,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Alpha Complex refused to deliver the notice.");
      rememberGmKey();
      setNoticeStatus(`NOTICE SENT TO ${pendingNotice.citizenId}`);
      setPendingNotice(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to send the official notice.");
    } finally {
      setNoticeSending(false);
    }
  }, [gmKey, noticeSending, pendingNotice, rememberGmKey, room]);

  const transcribeRecording = useCallback(async (blob: Blob, mimeType: string) => {
    if (!blob.size || !gmKey.trim()) return;
    setTranscribing(true);
    setError("");

    let transcript = "";
    try {
      const form = new FormData();
      const effectiveMime = blob.type || mimeType || "audio/webm";
      form.append("audio", blob, `friend-computer-listen.${extensionForMime(effectiveMime)}`);
      form.append("playerNames", playerNames.join(", "));

      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "x-friend-computer-gm-key": gmKey },
        body: form,
      });
      const data = (await response.json()) as TranscribeResponse;
      if (!response.ok || !data.text) throw new Error(data.error || "Friend Computer could not transcribe that recording.");
      rememberGmKey();

      transcript = data.text.trim();
      if (data.model) setTranscriptionModel(data.model);
      setLastTranscript(transcript);
      setPrompt(transcript);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to transcribe the recording.");
    } finally {
      setTranscribing(false);
    }

    if (transcript) await submitPrompt(transcript);
  }, [gmKey, playerNames, rememberGmKey, submitPrompt]);

  const stopListening = useCallback(() => {
    listenHeldRef.current = false;
    if (listenTimeoutRef.current) {
      window.clearTimeout(listenTimeoutRef.current);
      listenTimeoutRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const startListening = useCallback(async () => {
    if (!gmKey.trim()) {
      setError("Enter the GM AI passphrase before enabling Friend Computer's microphone.");
      listenHeldRef.current = false;
      return;
    }
    if (loading || transcribing || recording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser does not support push-to-listen recording.");
      listenHeldRef.current = false;
      return;
    }

    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (!listenHeldRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      chunksRef.current = [];
      const requestedMime = preferredRecorderMime();
      let recorder: MediaRecorder;
      try {
        recorder = requestedMime ? new MediaRecorder(stream, { mimeType: requestedMime }) : new MediaRecorder(stream);
      } catch {
        recorder = new MediaRecorder(stream);
      }

      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError("The browser microphone recorder encountered an error.");
      };
      recorder.onstop = () => {
        if (listenTimeoutRef.current) window.clearTimeout(listenTimeoutRef.current);
        listenTimeoutRef.current = null;
        setRecording(false);
        recorderRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        if (streamRef.current === stream) streamRef.current = null;

        const elapsed = Date.now() - listenStartedAtRef.current;
        const chunks = chunksRef.current;
        chunksRef.current = [];
        if (elapsed < 250 || chunks.length === 0) return;
        const recordedMime = recorder.mimeType || requestedMime || chunks[0]?.type || "audio/webm";
        const blob = new Blob(chunks, { type: recordedMime });
        void transcribeRecording(blob, recordedMime);
      };

      listenStartedAtRef.current = Date.now();
      recorder.start(250);
      setRecording(true);
      listenTimeoutRef.current = window.setTimeout(() => {
        listenHeldRef.current = false;
        if (recorder.state !== "inactive") recorder.stop();
      }, MAX_LISTEN_MS);
    } catch (reason) {
      listenHeldRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const name = reason instanceof DOMException ? reason.name : "";
      setError(
        name === "NotAllowedError"
          ? "Microphone permission was denied. Allow microphone access for this site and try again."
          : "Friend Computer could not access this device's microphone.",
      );
    }
  }, [gmKey, loading, recording, transcribeRecording, transcribing]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "KeyL" || event.repeat || isTypingTarget(event.target)) return;
      event.preventDefault();
      listenHeldRef.current = true;
      void startListening();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "KeyL") return;
      if (listenHeldRef.current || recording) {
        event.preventDefault();
        stopListening();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [recording, startListening, stopListening]);

  const approve = useCallback(() => {
    if (!pending) return;
    busRef.current?.send(pending.command);
    setPending(null);
  }, [pending]);

  const displayOnline = transport === "realtime" && presence.displays > 0;
  const latestAssistant = [...history].reverse().find((item) => item.role === "assistant") ?? null;
  const latestReply = latestAssistant?.text ?? "Friend Computer is awaiting a properly authorized inquiry.";
  const listenBusy = loading || transcribing;

  return (
    <main className="control-shell">
      <header className="control-header">
        <div>
          <span className="control-eyebrow">EXPERIMENTAL GM AI TERMINAL</span>
          <h1>Friend Computer Copilot</h1>
        </div>
        <div className="control-header-actions">
          <Link className="display-link" href={`/control/${encodeURIComponent(room)}`}>MANUAL CONTROLS</Link>
          <Link className="display-link" href={`/communications/${encodeURIComponent(room)}`}>COMMUNICATIONS</Link>
          <Link className="display-link" href={`/display/${encodeURIComponent(room)}`} target="_blank">OPEN DISPLAY ↗</Link>
          <div className={`connection-pill ${displayOnline ? "" : "connection-pill--warning"}`}><i /> {displayOnline ? "DISPLAY ONLINE" : "DISPLAY NOT DETECTED"}</div>
        </div>
      </header>

      <div className="control-grid">
        <section className="panel" style={{ gridColumn: "1 / -1" }}>
          <div className="panel-heading"><span>AI</span><h2>Copilot</h2></div>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <strong style={{ color: "#8fbfc3", fontSize: 12 }}>{model}</strong>
              <small style={{ color: "#6e9499" }}>TRANSCRIBE: {transcriptionModel} · GM APPROVAL REQUIRED FOR DISPLAY ACTIONS AND EMAIL</small>
            </div>

            <input
              type="password"
              autoComplete="off"
              value={gmKey}
              onChange={(event) => setGmKey(event.target.value)}
              placeholder="GM AI passphrase"
              aria-label="Friend Computer GM AI passphrase"
            />

            <button
              type="button"
              className={recording ? "danger" : "primary-action"}
              disabled={listenBusy || !gmKey.trim()}
              onPointerDown={(event) => {
                if (listenBusy || !gmKey.trim()) return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                listenHeldRef.current = true;
                void startListening();
              }}
              onPointerUp={(event) => {
                event.preventDefault();
                stopListening();
              }}
              onPointerCancel={stopListening}
              style={{ minHeight: 76, touchAction: "none", userSelect: "none", fontSize: 16 }}
            >
              {recording
                ? "● LISTENING — RELEASE TO SEND"
                : transcribing
                  ? "TRANSCRIBING…"
                  : loading
                    ? "FRIEND COMPUTER IS RESPONDING…"
                    : "HOLD TO LISTEN · OR HOLD L"}
            </button>

            {lastTranscript ? (
              <div style={{ border: "1px solid #29484b", padding: 10, color: "#8fbfc3", lineHeight: 1.4 }}>
                <small style={{ display: "block", color: "#6e9499", marginBottom: 5 }}>LAST HEARD</small>
                {lastTranscript}
              </div>
            ) : null}

            <div style={{ border: "1px solid #1e4347", padding: 12, minHeight: 86, color: "#aeecef", lineHeight: 1.5 }}>
              <small style={{ display: "block", color: "#6e9499", marginBottom: 6 }}>LATEST COMPUTER RESPONSE</small>
              {latestReply}
            </div>

            <div className="button-row" style={{ marginTop: 0 }}>
              <button
                type="button"
                className={autoSpeak ? "is-active" : ""}
                onClick={() => setAutoSpeak((value) => !value)}
                title="When enabled, each Friend Computer reply is spoken by the projector automatically."
              >
                AUTO-SPEAK REPLIES {autoSpeak ? "ON" : "OFF"}
              </button>
              <button
                type="button"
                disabled={!latestAssistant || !displayOnline}
                onClick={() => latestAssistant && sendSpeech(latestAssistant.text)}
              >
                SPEAK AGAIN
              </button>
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

            {pendingNotice ? (
              <div style={{ border: "1px solid #325f9b", padding: 14, background: "#07111d" }}>
                <div style={{ color: "#9dc8ff", fontWeight: 900, marginBottom: 8 }}>AI SUGGESTS OFFICIAL CITIZEN NOTICE</div>
                <div style={{ color: "#d9fbfd", lineHeight: 1.5, marginBottom: 10 }}>
                  <strong>TO:</strong> {pendingNotice.citizenId} · {pendingNotice.displayName}<br />
                  <strong>FROM:</strong> {SENDER_LABELS[pendingNotice.senderPersona]}<br />
                  <strong>SUBJECT:</strong> {pendingNotice.subject}<br />
                  <strong>RESPONSE:</strong> {pendingNotice.includeResponse ? "ACKNOWLEDGE / DENY" : "NONE"}
                </div>
                <div style={{ whiteSpace: "pre-wrap", border: "1px solid #234264", padding: 10, color: "#b9d9ee", lineHeight: 1.5, marginBottom: 10 }}>
                  {pendingNotice.body}
                </div>
                <div className="button-row" style={{ marginTop: 0 }}>
                  <button type="button" className="is-active" disabled={noticeSending} onClick={() => void sendNotice()}>
                    {noticeSending ? "SENDING…" : "SEND NOTICE"}
                  </button>
                  <button type="button" className="danger" disabled={noticeSending} onClick={() => setPendingNotice(null)}>DENY</button>
                  <Link className="display-link" href={`/communications/${encodeURIComponent(room)}`}>OPEN COMMS TO EDIT</Link>
                </div>
              </div>
            ) : null}

            {noticeStatus ? <div style={{ color: "#8fffb5", fontSize: 12, fontWeight: 800 }}>{noticeStatus}</div> : null}
            {error ? <div style={{ color: "#ff8d86", fontSize: 12 }}>{error}</div> : null}

            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void askComputer();
              }}
              placeholder="Or type what Friend Computer should respond to..."
              style={{ minHeight: 96 }}
            />
            <button type="button" className="primary-action" disabled={listenBusy || !gmKey.trim() || !prompt.trim()} onClick={() => void askComputer()}>
              {loading ? "CONSULTING FRIEND COMPUTER…" : "ASK FRIEND COMPUTER"}
            </button>

            <small style={{ color: "#6e9499", lineHeight: 1.45 }}>
              Push-to-listen only: the microphone activates while you hold the button (or L), stops when released, and automatically stops after 45 seconds. Copilot may draft one private Citizen notice using roster metadata, but real email addresses remain server-side and the message is not delivered unless you press SEND NOTICE.
            </small>
          </div>
        </section>
      </div>
    </main>
  );
}
