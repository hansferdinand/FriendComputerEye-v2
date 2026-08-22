"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createCommandBus, type CommandBus, type RoomPresence } from "@/lib/transport";

type CheckState = { ok: boolean; detail: string };
type RouteState = CheckState & { label: string; path: string; ms?: number };
type ServerReadiness = {
  ok?: boolean;
  error?: string;
  configuration?: {
    gmAuthorization?: boolean;
    openAI?: boolean;
    resend?: boolean;
  };
  database?: CheckState & { citizenCount?: number };
  mailDns?: {
    mx?: CheckState;
    spf?: CheckState;
    dkim?: CheckState;
  };
  deployment?: {
    commit?: string;
    environment?: string;
    region?: string;
  };
};

type BrowserCapabilities = {
  online: boolean;
  microphoneRecording: boolean;
  speechSynthesis: boolean;
  fullscreen: boolean;
  wakeLock: boolean;
  broadcastChannel: boolean;
  localStorage: boolean;
};

function detectCapabilities(): BrowserCapabilities {
  let localStorage = false;
  try {
    const key = "friend-computer-readiness-probe";
    window.localStorage.setItem(key, "1");
    window.localStorage.removeItem(key);
    localStorage = true;
  } catch {
    localStorage = false;
  }

  const runtimeNavigator = navigator as Navigator & { mediaDevices?: MediaDevices };

  return {
    online: navigator.onLine,
    microphoneRecording: Boolean(runtimeNavigator.mediaDevices && typeof MediaRecorder !== "undefined"),
    speechSynthesis: "speechSynthesis" in window,
    fullscreen: typeof document.documentElement.requestFullscreen === "function",
    wakeLock: "wakeLock" in navigator,
    broadcastChannel: typeof BroadcastChannel !== "undefined",
    localStorage,
  };
}

function StatusRow({ label, state, muted = false }: { label: string; state: CheckState | null; muted?: boolean }) {
  const color = !state ? "#6e9499" : state.ok ? "#87f6fb" : "#ff8d86";
  const symbol = !state ? "○" : state.ok ? "●" : "×";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(130px, 0.8fr) minmax(0, 1.8fr)", gap: 10, padding: "8px 0", borderBottom: "1px solid #102c2f" }}>
      <strong style={{ color: muted ? "#7f9a9d" : color, fontSize: 12 }}>{symbol} {label}</strong>
      <span style={{ color: muted ? "#6e9499" : "#a8d7da", fontSize: 12, overflowWrap: "anywhere" }}>{state?.detail ?? "Not checked"}</span>
    </div>
  );
}

export function ShowReadinessPanel({ room }: { room: string }) {
  const [gmKey, setGmKey] = useState("");
  const [transport, setTransport] = useState<CommandBus["transport"]>("connecting");
  const [presence, setPresence] = useState<RoomPresence>({ displays: 0, controls: 0 });
  const [capabilities, setCapabilities] = useState<BrowserCapabilities | null>(null);
  const [server, setServer] = useState<ServerReadiness | null>(null);
  const [routes, setRoutes] = useState<RouteState[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [serverMs, setServerMs] = useState<number | null>(null);

  useEffect(() => {
    setCapabilities(detectCapabilities());
    const refreshOnline = () => setCapabilities(detectCapabilities());
    window.addEventListener("online", refreshOnline);
    window.addEventListener("offline", refreshOnline);

    const bus = createCommandBus(room, undefined, setTransport, setPresence);
    return () => {
      bus.close();
      window.removeEventListener("online", refreshOnline);
      window.removeEventListener("offline", refreshOnline);
    };
  }, [room]);

  const routeTargets = useMemo(() => [
    { label: "JOIN CHECKPOINT", path: `/join/${encodeURIComponent(room)}` },
    { label: "MANUAL CONTROLLER", path: `/control/${encodeURIComponent(room)}` },
    { label: "MISSION CONTEXT", path: `/session/${encodeURIComponent(room)}` },
    { label: "AI COPILOT", path: `/copilot/${encodeURIComponent(room)}` },
    { label: "CITIZEN COMMS", path: `/communications/${encodeURIComponent(room)}` },
    { label: "PROJECTOR DISPLAY", path: `/display/${encodeURIComponent(room)}` },
  ], [room]);

  const checkRoutes = useCallback(async () => {
    const results = await Promise.all(routeTargets.map(async (target): Promise<RouteState> => {
      const started = performance.now();
      try {
        const response = await fetch(target.path, { method: "GET", cache: "no-store" });
        const ms = Math.round(performance.now() - started);
        return {
          ...target,
          ok: response.ok,
          detail: response.ok ? `HTTP ${response.status} · ${ms} ms` : `HTTP ${response.status}`,
          ms,
        };
      } catch {
        return { ...target, ok: false, detail: "Route request failed" };
      }
    }));
    setRoutes(results);
    return results;
  }, [routeTargets]);

  const runCheck = useCallback(async () => {
    if (!gmKey.trim()) return;
    setRunning(true);
    setError("");
    setServer(null);
    setRoutes([]);
    setCapabilities(detectCapabilities());

    try {
      const started = performance.now();
      const [serverResponse] = await Promise.all([
        fetch("/api/readiness", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-friend-computer-gm-key": gmKey,
          },
          body: JSON.stringify({ room }),
          cache: "no-store",
        }),
        checkRoutes(),
      ]);
      setServerMs(Math.round(performance.now() - started));
      const data = (await serverResponse.json()) as ServerReadiness;
      if (!serverResponse.ok) throw new Error(data.error || "Show readiness check failed.");
      setServer(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to complete show readiness check.");
    } finally {
      setRunning(false);
    }
  }, [checkRoutes, gmKey, room]);

  const displayOnline = transport === "realtime" && presence.displays > 0;
  const criticalStates: Array<boolean | undefined> = server ? [
    server.configuration?.gmAuthorization,
    server.configuration?.openAI,
    server.configuration?.resend,
    server.database?.ok,
    server.mailDns?.mx?.ok,
    server.mailDns?.spf?.ok,
    server.mailDns?.dkim?.ok,
    displayOnline,
    ...routes.map((route) => route.ok),
  ] : [];
  const checked = Boolean(server && routes.length === routeTargets.length);
  const showReady = checked && criticalStates.every(Boolean);

  const browserRows: Array<[string, boolean, string]> = capabilities ? [
    ["NETWORK ONLINE", capabilities.online, capabilities.online ? "Browser reports online" : "Browser reports offline"],
    ["MIC + RECORDER", capabilities.microphoneRecording, capabilities.microphoneRecording ? "Push-to-listen supported on this device" : "MediaRecorder/getUserMedia unavailable"],
    ["SPEECH SYNTHESIS", capabilities.speechSynthesis, capabilities.speechSynthesis ? "Browser speech synthesis available" : "Speech synthesis unavailable"],
    ["FULLSCREEN API", capabilities.fullscreen, capabilities.fullscreen ? "Fullscreen supported" : "Fullscreen API unavailable"],
    ["WAKE LOCK API", capabilities.wakeLock, capabilities.wakeLock ? "Wake Lock supported" : "Wake Lock unavailable"],
    ["BROADCASTCHANNEL", capabilities.broadcastChannel, capabilities.broadcastChannel ? "Same-device fallback supported" : "BroadcastChannel unavailable"],
    ["LOCAL STORAGE", capabilities.localStorage, capabilities.localStorage ? "Storage fallback available" : "Local storage unavailable"],
  ] : [];

  return (
    <main className="control-shell">
      <header className="control-header">
        <div>
          <span className="control-eyebrow">MILESTONE 5 · PRE-SHOW DIAGNOSTICS</span>
          <h1>Show Readiness</h1>
        </div>
        <div className="control-header-actions">
          <Link className="display-link" href={`/control/${encodeURIComponent(room)}`}>MANUAL CONTROLS</Link>
          <Link className="display-link" href={`/session/${encodeURIComponent(room)}`}>MISSION CONTEXT</Link>
          <Link className="display-link" href={`/copilot/${encodeURIComponent(room)}`}>AI COPILOT</Link>
          <Link className="display-link" href={`/communications/${encodeURIComponent(room)}`}>COMMUNICATIONS</Link>
          <Link className="display-link" href={`/display/${encodeURIComponent(room)}`} target="_blank">DISPLAY ↗</Link>
        </div>
      </header>

      <div className="control-grid">
        <section className="panel" style={{ gridColumn: "1 / -1" }}>
          <div className="panel-heading"><span>✓</span><h2>Pre-Show Check</h2></div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) auto", gap: 10 }}>
            <input
              type="password"
              autoComplete="off"
              value={gmKey}
              onChange={(event) => setGmKey(event.target.value)}
              placeholder="GM AI passphrase"
              aria-label="GM authorization passphrase"
            />
            <button type="button" className="primary-action" disabled={running || !gmKey.trim()} onClick={() => void runCheck()}>
              {running ? "RUNNING CHECKS…" : "RUN SHOW CHECK"}
            </button>
          </div>
          <div style={{ marginTop: 14, border: `1px solid ${showReady ? "#397e83" : checked ? "#806b26" : "#1e4347"}`, padding: 14, background: "#041013" }}>
            <strong style={{ color: showReady ? "#87f6fb" : checked ? "#ffe36c" : "#8fbfc3", fontSize: 18 }}>
              {showReady ? "SHOW READY" : checked ? "ATTENTION REQUIRED" : "AWAITING CHECK"}
            </strong>
            <div style={{ color: "#7fa4a8", fontSize: 12, marginTop: 5 }}>
              Room {room} · This page never sends projector commands. GM key remains only in this browser tab.
            </div>
          </div>
          {error ? <div style={{ marginTop: 10, color: "#ff8d86", fontSize: 12 }}>{error}</div> : null}
        </section>

        <section className="panel">
          <div className="panel-heading"><span>NET</span><h2>Room Transport</h2></div>
          <StatusRow label="SUPABASE REALTIME" state={{ ok: transport === "realtime", detail: `Transport: ${transport}` }} />
          <StatusRow label="DISPLAY PRESENCE" state={{ ok: displayOnline, detail: displayOnline ? `${presence.displays} display(s) online` : "No Realtime display detected" }} />
          <StatusRow label="CONTROL PRESENCE" state={{ ok: presence.controls > 0, detail: `${presence.controls} control/readiness client(s) detected` }} muted />
        </section>

        <section className="panel">
          <div className="panel-heading"><span>SRV</span><h2>Server Configuration</h2></div>
          <StatusRow label="GM AUTH" state={server ? { ok: Boolean(server.configuration?.gmAuthorization), detail: "GM authorization accepted" } : null} />
          <StatusRow label="OPENAI KEY" state={server ? { ok: Boolean(server.configuration?.openAI), detail: server.configuration?.openAI ? "OPENAI_API_KEY loaded" : "OPENAI_API_KEY missing" } : null} />
          <StatusRow label="RESEND KEY" state={server ? { ok: Boolean(server.configuration?.resend), detail: server.configuration?.resend ? "RESEND_API_KEY loaded" : "RESEND_API_KEY missing" } : null} />
          <StatusRow label="SUPABASE RPC" state={server?.database ? { ok: server.database.ok, detail: `${server.database.detail} · ${server.database.citizenCount ?? 0} citizen(s)` } : null} />
          {server?.deployment ? <div style={{ marginTop: 10, color: "#6e9499", fontSize: 11 }}>DEPLOY {server.deployment.commit} · {server.deployment.environment} · {server.deployment.region} · CHECK {serverMs ?? "—"} ms</div> : null}
        </section>

        <section className="panel">
          <div className="panel-heading"><span>DNS</span><h2>Alpha Complex Mail</h2></div>
          <StatusRow label="DKIM" state={server?.mailDns?.dkim ?? null} />
          <StatusRow label="SPF TXT" state={server?.mailDns?.spf ?? null} />
          <StatusRow label="RETURN-PATH MX" state={server?.mailDns?.mx ?? null} />
          <small style={{ display: "block", marginTop: 10, color: "#6e9499", lineHeight: 1.4 }}>These are live DNS lookups from the Vercel server. They do not send email.</small>
        </section>

        <section className="panel">
          <div className="panel-heading"><span>DEV</span><h2>This Device</h2></div>
          {browserRows.map(([label, ok, detail]) => <StatusRow key={label} label={label} state={{ ok, detail }} muted={!ok && ["WAKE LOCK API", "FULLSCREEN API", "SPEECH SYNTHESIS"].includes(label)} />)}
        </section>

        <section className="panel" style={{ gridColumn: "1 / -1" }}>
          <div className="panel-heading"><span>HTTP</span><h2>Operational Routes</h2></div>
          {routeTargets.map((target) => {
            const route = routes.find((item) => item.path === target.path) ?? null;
            return (
              <div key={target.path} style={{ display: "grid", gridTemplateColumns: "minmax(150px,.8fr) minmax(0,1.8fr) auto", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid #102c2f" }}>
                <strong style={{ color: !route ? "#6e9499" : route.ok ? "#87f6fb" : "#ff8d86", fontSize: 12 }}>{!route ? "○" : route.ok ? "●" : "×"} {target.label}</strong>
                <span style={{ color: "#8fbfc3", fontSize: 12 }}>{route?.detail ?? "Not checked"}</span>
                <Link className="display-link" href={target.path} target={target.label === "PROJECTOR DISPLAY" ? "_blank" : undefined}>OPEN</Link>
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
