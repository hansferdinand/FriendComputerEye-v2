"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EXPRESSIONS,
  PLAYER_PRESETS,
  THREAT_LEVELS,
  type Expression,
  type FriendCommand,
  type ThreatLevel,
} from "@/lib/friend-computer";
import {
  createCommandBus,
  type CommandBus,
  type CommandReceipt,
  type RoomPresence,
} from "@/lib/transport";

const PLAYER_STORAGE_KEY = "friend-computer-v2:player-names:v1";

const expressionLabels: Record<Expression, string> = {
  neutral: "Neutral",
  happy: "Happy",
  suspicious: "Suspicious",
  angry: "Angry",
  terrified: "Terrified",
  drugged: "Drugged",
};

type MacroStep = {
  afterMs: number;
  command: FriendCommand;
};

type QuickMacro = {
  id: string;
  label: string;
  danger?: boolean;
  stopsPatrol?: boolean;
  steps: MacroStep[];
};

type DeliveryState = "idle" | "pending" | "acked" | "unconfirmed";

const QUICK_MACROS: QuickMacro[] = [
  {
    id: "friendly",
    label: "Friendly",
    steps: [
      { afterMs: 0, command: { type: "set-expression", expression: "happy", intensity: 0.72 } },
      { afterMs: 0, command: { type: "set-threat", level: "GREEN" } },
      { afterMs: 0, command: { type: "set-status", text: "FRIEND COMPUTER IS PLEASED WITH YOUR COOPERATION" } },
      { afterMs: 350, command: { type: "effect", effect: "blink" } },
    ],
  },
  {
    id: "concerned",
    label: "Concerned",
    steps: [
      { afterMs: 0, command: { type: "set-expression", expression: "suspicious", intensity: 0.64 } },
      { afterMs: 0, command: { type: "set-threat", level: "YELLOW" } },
      { afterMs: 0, command: { type: "set-status", text: "FRIEND COMPUTER HAS NOTICED AN IRREGULARITY" } },
      { afterMs: 220, command: { type: "effect", effect: "double-blink" } },
    ],
  },
  {
    id: "red-alert",
    label: "Red Alert",
    danger: true,
    steps: [
      { afterMs: 0, command: { type: "set-threat", level: "RED" } },
      { afterMs: 0, command: { type: "set-expression", expression: "angry", intensity: 0.9 } },
      { afterMs: 70, command: { type: "effect", effect: "glitch" } },
      { afterMs: 150, command: { type: "set-status", text: "SECURITY ALERT: REMAIN WHERE YOU ARE" } },
    ],
  },
  {
    id: "interrogation",
    label: "Interrogation",
    danger: true,
    stopsPatrol: true,
    steps: [
      { afterMs: 0, command: { type: "effect", effect: "interrogation" } },
      { afterMs: 260, command: { type: "set-status", text: "HONEST CITIZENS ENJOY QUESTIONS" } },
    ],
  },
  {
    id: "propaganda",
    label: "Propaganda Break",
    steps: [
      { afterMs: 0, command: { type: "set-expression", expression: "happy", intensity: 0.8 } },
      { afterMs: 100, command: { type: "effect", effect: "random-ad" } },
    ],
  },
  {
    id: "all-clear",
    label: "All Clear",
    stopsPatrol: true,
    steps: [
      { afterMs: 0, command: { type: "effect", effect: "reset" } },
      { afterMs: 180, command: { type: "set-status", text: "THANK YOU FOR YOUR COOPERATION, CITIZEN" } },
      { afterMs: 360, command: { type: "set-expression", expression: "happy", intensity: 0.62 } },
    ],
  },
];

export function ControlPanel({ room }: { room: string }) {
  const busRef = useRef<CommandBus | null>(null);
  const macroTimersRef = useRef<number[]>([]);
  const pendingReceiptRef = useRef<string | null>(null);
  const receiptTimerRef = useRef<number | null>(null);
  const [transport, setTransport] = useState<CommandBus["transport"]>("connecting");
  const [presence, setPresence] = useState<RoomPresence>({ displays: 0, controls: 0 });
  const [delivery, setDelivery] = useState<DeliveryState>("idle");
  const [activeMacro, setActiveMacro] = useState<string | null>(null);
  const [speech, setSpeech] = useState("");
  const [status, setStatus] = useState("");
  const [patrol, setPatrol] = useState(false);
  const [playerNames, setPlayerNames] = useState<string[]>(() => PLAYER_PRESETS.map((p) => p.label));
  const roomLabel = useMemo(() => room.toUpperCase(), [room]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(PLAYER_STORAGE_KEY) ?? "null") as unknown;
      if (Array.isArray(saved) && saved.length === PLAYER_PRESETS.length && saved.every((item) => typeof item === "string")) {
        setPlayerNames(saved);
      }
    } catch {
      // Defaults are perfectly usable if storage is blocked or malformed.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(playerNames));
    } catch {
      // Player labels are a convenience, never a show-critical dependency.
    }
  }, [playerNames]);

  useEffect(() => {
    const handleReceipt = (receipt: CommandReceipt) => {
      if (receipt.id !== pendingReceiptRef.current) return;
      pendingReceiptRef.current = null;
      if (receiptTimerRef.current) window.clearTimeout(receiptTimerRef.current);
      receiptTimerRef.current = null;
      setDelivery("acked");
    };

    const bus = createCommandBus(room, undefined, setTransport, setPresence, handleReceipt);
    busRef.current = bus;
    return () => {
      bus.close();
      busRef.current = null;
      pendingReceiptRef.current = null;
      if (receiptTimerRef.current) window.clearTimeout(receiptTimerRef.current);
      receiptTimerRef.current = null;
    };
  }, [room]);

  const send = useCallback((command: FriendCommand) => {
    const id = busRef.current?.send(command);
    if (!id) return;

    pendingReceiptRef.current = id;
    if (receiptTimerRef.current) window.clearTimeout(receiptTimerRef.current);
    setDelivery("pending");
    receiptTimerRef.current = window.setTimeout(() => {
      if (pendingReceiptRef.current === id) setDelivery("unconfirmed");
    }, 1600);
  }, []);

  const clearMacroTimers = useCallback(() => {
    for (const timer of macroTimersRef.current) window.clearTimeout(timer);
    macroTimersRef.current = [];
  }, []);

  useEffect(() => () => clearMacroTimers(), [clearMacroTimers]);

  const runMacro = useCallback((macro: QuickMacro) => {
    clearMacroTimers();
    setActiveMacro(macro.id);
    if (macro.stopsPatrol) setPatrol(false);

    for (const step of macro.steps) {
      if (step.afterMs === 0) {
        send(step.command);
      } else {
        macroTimersRef.current.push(window.setTimeout(() => send(step.command), step.afterMs));
      }
    }

    const lastStep = Math.max(...macro.steps.map((step) => step.afterMs), 0);
    macroTimersRef.current.push(window.setTimeout(() => setActiveMacro(null), lastStep + 650));
  }, [clearMacroTimers, send]);

  function targetPlayer(index: number) {
    const preset = PLAYER_PRESETS[index];
    send({ type: "set-gaze", x: preset.x, y: preset.y, target: playerNames[index] || preset.label });
    setPatrol(false);
  }

  function updatePlayerName(index: number, value: string) {
    setPlayerNames((current) => current.map((name, itemIndex) => (itemIndex === index ? value : name)));
  }

  function speak() {
    if (!speech.trim()) return;
    send({ type: "speak", text: speech.trim() });
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const key = event.key.toLowerCase();
      if (key === "a") send({ type: "set-expression", expression: "angry", intensity: 0.9 });
      if (key === "s") send({ type: "set-expression", expression: "suspicious", intensity: 0.82 });
      if (key === "e") send({ type: "effect", effect: "error" });
      if (key === "c") send({ type: "effect", effect: "clone" });
      if (key === "g") send({ type: "effect", effect: "glitch" });
      if (key === "i") send({ type: "effect", effect: "interrogation" });
      if (key === "b") send({ type: "effect", effect: "random-ad" });
      if (key === "Escape") send({ type: "effect", effect: "reset" });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [send]);

  const transportLabel =
    transport === "realtime"
      ? "SUPABASE REALTIME + LOCAL FALLBACK"
      : transport === "connecting"
        ? "CONNECTING TO REALTIME"
        : transport === "broadcast"
          ? "LOCAL BROADCAST FALLBACK"
          : transport === "storage"
            ? "LOCAL STORAGE FALLBACK"
            : "NO COMMAND BUS";

  const displayOnline = transport === "realtime" && presence.displays > 0;
  const presenceLabel =
    transport === "realtime"
      ? displayOnline
        ? `DISPLAY ONLINE${presence.displays > 1 ? ` ×${presence.displays}` : ""}`
        : "DISPLAY NOT DETECTED"
      : "DISPLAY PRESENCE UNKNOWN";
  const presenceClass =
    transport === "realtime"
      ? displayOnline
        ? ""
        : "connection-pill--warning"
      : "connection-pill--muted";

  const deliveryLabel =
    transport !== "realtime"
      ? "REMOTE ACK UNAVAILABLE"
      : !displayOnline
        ? "NO DISPLAY TO ACK"
        : delivery === "pending"
          ? "WAITING FOR DISPLAY ACK"
          : delivery === "unconfirmed"
            ? "COMMAND UNCONFIRMED"
            : delivery === "acked"
              ? "LAST COMMAND ACKNOWLEDGED"
              : "ACK CHANNEL READY";
  const deliveryClass =
    transport !== "realtime"
      ? "connection-pill--muted"
      : !displayOnline || delivery === "pending"
        ? "connection-pill--warning"
        : delivery === "unconfirmed"
          ? "connection-pill--bad"
          : "";

  return (
    <main className="control-shell">
      <header className="control-header">
        <div>
          <span className="control-eyebrow">AUTHORIZED GM TERMINAL</span>
          <h1>Friend Computer</h1>
        </div>
        <div className="control-header-actions">
          <Link className="display-link" href={`/display/${encodeURIComponent(room)}`} target="_blank">OPEN DISPLAY ↗</Link>
          <div className={`connection-pill ${transport === "none" ? "connection-pill--bad" : ""}`}><i /> {transportLabel} · {roomLabel}</div>
          <div className={`connection-pill ${presenceClass}`}><i /> {presenceLabel}</div>
          <div className={`connection-pill ${deliveryClass}`}><i /> {deliveryLabel}</div>
        </div>
      </header>

      <div className="control-grid">
        <section className="panel panel--macros">
          <div className="panel-heading"><span>00</span><h2>Quick Procedures</h2></div>
          <div className="macro-grid">
            {QUICK_MACROS.map((macro) => (
              <button
                type="button"
                key={macro.id}
                className={`${macro.danger ? "danger" : ""} ${activeMacro === macro.id ? "is-active" : ""}`}
                onClick={() => runMacro(macro)}
              >
                {macro.label}
              </button>
            ))}
          </div>
        </section>

        <section className="panel panel--players">
          <div className="panel-heading"><span>01</span><h2>Citizen Targeting</h2></div>
          <div className="player-grid">
            {PLAYER_PRESETS.map((player, index) => (
              <div className="player-control" key={player.id}>
                <input
                  aria-label={`Player ${index + 1} name`}
                  value={playerNames[index]}
                  onChange={(event) => updatePlayerName(index, event.target.value)}
                />
                <button type="button" onClick={() => targetPlayer(index)}>WATCH</button>
              </div>
            ))}
          </div>
          <div className="button-row">
            <button type="button" onClick={() => { send({ type: "set-gaze", x: 0, y: 0, target: "CENTER" }); setPatrol(false); }}>CENTER</button>
            <button
              type="button"
              className={patrol ? "is-active" : ""}
              onClick={() => {
                const next = !patrol;
                setPatrol(next);
                send({ type: "set-patrol", enabled: next });
              }}
            >
              {patrol ? "STOP PATROL" : "PATROL"}
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading"><span>02</span><h2>Expression</h2></div>
          <div className="action-grid action-grid--three">
            {EXPRESSIONS.map((expression) => (
              <button
                type="button"
                key={expression}
                className={`expression-${expression}`}
                onClick={() => send({ type: "set-expression", expression, intensity: expression === "neutral" ? 0.5 : 0.88 })}
              >
                {expressionLabels[expression]}
              </button>
            ))}
          </div>
          <div className="button-row button-row--tight">
            <button type="button" onClick={() => send({ type: "effect", effect: "blink" })}>BLINK</button>
            <button type="button" onClick={() => send({ type: "effect", effect: "double-blink" })}>DOUBLE</button>
            <button type="button" onClick={() => send({ type: "effect", effect: "toggle-eye" })}>EYE ON/OFF</button>
          </div>
        </section>

        <section className="panel panel--threat">
          <div className="panel-heading"><span>03</span><h2>Security Threat</h2></div>
          <div className="threat-grid">
            {THREAT_LEVELS.map((level) => (
              <button
                type="button"
                key={level}
                className={`clearance clearance--${level.toLowerCase()}`}
                onClick={() => send({ type: "set-threat", level: level as ThreatLevel })}
              >
                {level}
              </button>
            ))}
          </div>
        </section>

        <section className="panel panel--effects">
          <div className="panel-heading"><span>04</span><h2>Special Procedures</h2></div>
          <div className="action-grid action-grid--two">
            <button type="button" className="danger" onClick={() => send({ type: "effect", effect: "interrogation" })}>INTERROGATION</button>
            <button type="button" onClick={() => send({ type: "effect", effect: "clone" })}>NEW CLONE</button>
            <button type="button" onClick={() => send({ type: "effect", effect: "random-ad" })}>PROPAGANDA</button>
            <button type="button" onClick={() => send({ type: "effect", effect: "happy-ad" })}>HAPPINESS</button>
            <button type="button" onClick={() => send({ type: "effect", effect: "error" })}>SYSTEM ERROR</button>
            <button type="button" onClick={() => send({ type: "effect", effect: "glitch" })}>GLITCH</button>
            <button type="button" onClick={() => send({ type: "effect", effect: "degauss" })}>DEGAUSS</button>
            <button type="button" onClick={() => send({ type: "effect", effect: "drugged" })}>DRUGGED</button>
          </div>
        </section>

        <section className="panel panel--speech">
          <div className="panel-heading"><span>05</span><h2>Voice of the Computer</h2></div>
          <textarea
            value={speech}
            onChange={(event) => setSpeech(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") speak();
            }}
            placeholder="Citizen, your continued survival indicates that Friend Computer has been extremely generous..."
          />
          <button type="button" className="primary-action" onClick={speak}>SPEAK</button>
        </section>

        <section className="panel panel--status">
          <div className="panel-heading"><span>06</span><h2>Display Message</h2></div>
          <input
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            placeholder="Override lower status line..."
          />
          <div className="button-row">
            <button type="button" onClick={() => send({ type: "set-status", text: status || "COMPUTER IS YOUR FRIEND" })}>SEND STATUS</button>
            <button type="button" className="danger" onClick={() => { setPatrol(false); send({ type: "effect", effect: "reset" }); }}>RESET DISPLAY</button>
          </div>
        </section>
      </div>
    </main>
  );
}
