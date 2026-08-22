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
import { createCommandBus, type CommandBus } from "@/lib/transport";

const PLAYER_STORAGE_KEY = "friend-computer-v2:player-names:v1";

const expressionLabels: Record<Expression, string> = {
  neutral: "Neutral",
  happy: "Happy",
  suspicious: "Suspicious",
  angry: "Angry",
  terrified: "Terrified",
  drugged: "Drugged",
};

export function ControlPanel({ room }: { room: string }) {
  const busRef = useRef<CommandBus | null>(null);
  const [transport, setTransport] = useState<CommandBus["transport"]>("none");
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
    const bus = createCommandBus(room);
    busRef.current = bus;
    setTransport(bus.transport);
    return () => {
      bus.close();
      busRef.current = null;
    };
  }, [room]);

  const send = useCallback((command: FriendCommand) => {
    busRef.current?.send(command);
  }, []);

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

  const transportLabel = transport === "broadcast" ? "BROADCAST" : transport === "storage" ? "STORAGE FALLBACK" : "NO LOCAL BUS";

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
        </div>
      </header>

      <div className="control-grid">
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
