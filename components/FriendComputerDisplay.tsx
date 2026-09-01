"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { AmbientIdleEffects } from "@/components/AmbientIdleEffects";
import { FriendEye } from "@/components/FriendEye";
import { LoadingTimerDisplay } from "@/components/LoadingTimerDisplay";
import { ProjectorStateOverlay } from "@/components/ProjectorStateOverlay";
import { ScenarioDisplay } from "@/components/ScenarioDisplay";
import {
  ADVERTISEMENTS,
  IDLE_MESSAGES,
  INITIAL_STATE,
  PLAYER_PRESETS,
  type FriendCommand,
  type FriendComputerState,
  type ProjectorState,
} from "@/lib/friend-computer";
import type { DisplayAudioRole } from "@/lib/display-config";
import {
  isLoadingTimerState,
  loadingTimerStorageKey,
  type LoadingTimerState,
} from "@/lib/loading-timer";
import { createCommandBus } from "@/lib/transport";
import type { ScenarioRuntimeSnapshot } from "@/lib/scenario-runtime";

type Overlay =
  | { kind: "none" }
  | { kind: "error" }
  | { kind: "clone" }
  | { kind: "interrogation" }
  | { kind: "ad"; index: number };

type ScreenWakeLockSentinel = {
  released: boolean;
  release: () => Promise<void>;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<ScreenWakeLockSentinel>;
  };
};

function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  const preferredNames = [
    "Microsoft Zira",
    "Google US English",
    "Samantha",
    "Victoria",
    "Daniel",
    "Alex",
  ];
  for (const name of preferredNames) {
    const match = voices.find(
      (voice) => voice.name.toLowerCase().includes(name.toLowerCase()) && voice.lang.toLowerCase().startsWith("en"),
    );
    if (match) return match;
  }
  return voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ?? voices[0] ?? null;
}

export function FriendComputerDisplay({
  room,
  displayName,
  audioRole,
}: {
  room: string;
  displayName: string;
  audioRole: DisplayAudioRole;
}) {
  const [state, setState] = useState<FriendComputerState>(INITIAL_STATE);
  const [overlay, setOverlay] = useState<Overlay>({ kind: "none" });
  const [blinkNonce, setBlinkNonce] = useState(0);
  const [doubleBlinkNonce, setDoubleBlinkNonce] = useState(0);
  const [glitchNonce, setGlitchNonce] = useState(0);
  const [degaussNonce, setDegaussNonce] = useState(0);
  const [warmupNonce, setWarmupNonce] = useState(0);
  const [audioReady, setAudioReady] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [scenario, setScenario] = useState<ScenarioRuntimeSnapshot | null>(null);
  const [projectorState, setProjectorState] = useState<ProjectorState | null>(null);
  const [loadingTimer, setLoadingTimer] = useState<LoadingTimerState | null>(null);
  const [loadedLoadingTimerRoom, setLoadedLoadingTimerRoom] = useState<string | null>(null);
  const overlayTimerRef = useRef<number | null>(null);
  const statusLockUntilRef = useRef(0);
  const lastDirectedGazeRef = useRef(0);
  const startAudioRef = useRef<HTMLAudioElement | null>(null);
  const humAudioRef = useRef<HTMLAudioElement | null>(null);
  const wakeLockRef = useRef<ScreenWakeLockSentinel | null>(null);
  const audioEnabled = audioRole === "primary";

  useEffect(() => {
    const start = new Audio("/audio/crt-start.mp3");
    const hum = new Audio("/audio/crt-hum.mp3");
    start.preload = "auto";
    hum.preload = "auto";
    hum.loop = true;
    hum.volume = 0;
    startAudioRef.current = start;
    humAudioRef.current = hum;
    return () => {
      start.pause();
      hum.pause();
      startAudioRef.current = null;
      humAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (overlayTimerRef.current) window.clearTimeout(overlayTimerRef.current);
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      if (wakeLockRef.current && !wakeLockRef.current.released) {
        void wakeLockRef.current.release();
      }
      wakeLockRef.current = null;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(loadingTimerStorageKey(room));
      const parsed = raw ? JSON.parse(raw) as unknown : null;
      setLoadingTimer(isLoadingTimerState(parsed) ? parsed : null);
    } catch {
      setLoadingTimer(null);
    }
    setLoadedLoadingTimerRoom(room);
  }, [room]);

  useEffect(() => {
    if (loadedLoadingTimerRoom !== room) return;
    try {
      const key = loadingTimerStorageKey(room);
      if (loadingTimer) window.localStorage.setItem(key, JSON.stringify(loadingTimer));
      else window.localStorage.removeItem(key);
    } catch {
      // The live command remains usable when local recovery is unavailable.
    }
  }, [loadedLoadingTimerRoom, loadingTimer, room]);

  useEffect(() => {
    if (audioEnabled) return;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
    startAudioRef.current?.pause();
    if (humAudioRef.current) {
      humAudioRef.current.pause();
      humAudioRef.current.volume = 0;
    }
  }, [audioEnabled]);

  const acquireWakeLock = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    if (wakeLockRef.current && !wakeLockRef.current.released) return;
    const wakeLockApi = (navigator as WakeLockNavigator).wakeLock;
    if (!wakeLockApi) return;

    try {
      wakeLockRef.current = await wakeLockApi.request("screen");
    } catch {
      // Wake Lock is progressive enhancement; display behavior remains unchanged.
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Fullscreen can be blocked by browser policy; keyboard controls remain usable.
    }
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (audioReady && document.visibilityState === "visible") void acquireWakeLock();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [acquireWakeLock, audioReady]);

  const clearOverlayLater = useCallback((delay: number) => {
    if (overlayTimerRef.current) window.clearTimeout(overlayTimerRef.current);
    overlayTimerRef.current = window.setTimeout(() => setOverlay({ kind: "none" }), delay);
  }, []);

  const speak = useCallback((text: string) => {
    if (!audioEnabled || !text.trim() || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.trim());
    const voice = pickVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = "en-US";
    }
    utterance.rate = 0.9;
    utterance.pitch = 1.15;
    utterance.volume = 1;
    utterance.onstart = () => {
      setSpeaking(true);
      if (humAudioRef.current) humAudioRef.current.volume = 0.045;
    };
    const restoreAudio = () => {
      setSpeaking(false);
      if (humAudioRef.current && audioReady && audioEnabled) humAudioRef.current.volume = 0.14;
    };
    utterance.onend = restoreAudio;
    utterance.onerror = restoreAudio;
    window.speechSynthesis.speak(utterance);
  }, [audioEnabled, audioReady]);

  const applyCommand = useCallback(
    (command: FriendCommand) => {
      switch (command.type) {
        case "set-scenario":
          setScenario(command.snapshot.displayEnabled ? command.snapshot : null);
          break;
        case "exit-scenario":
          setScenario(null);
          setState(INITIAL_STATE);
          setOverlay({ kind: "none" });
          break;
        case "show-projector-state":
          setProjectorState(command.state);
          break;
        case "clear-projector-state":
          setProjectorState(null);
          break;
        case "set-loading-timer":
          setLoadingTimer(command.timer);
          break;
        case "clear-loading-timer":
          setLoadingTimer(null);
          break;
        case "set-gaze":
          lastDirectedGazeRef.current = Date.now();
          setState((current) => ({ ...current, patrol: false, gaze: command }));
          break;
        case "set-expression":
          setState((current) => ({
            ...current,
            expression: command.expression,
            intensity: command.intensity ?? current.intensity,
          }));
          break;
        case "set-threat":
          setState((current) => ({ ...current, threat: command.level }));
          break;
        case "set-status": {
          const text = command.text.trim() || INITIAL_STATE.status;
          statusLockUntilRef.current = Date.now() + 9000;
          setState((current) => ({ ...current, status: text }));
          break;
        }
        case "set-patrol":
          setState((current) => ({ ...current, patrol: command.enabled }));
          break;
        case "speak":
          speak(command.text);
          break;
        case "effect": {
          if (command.effect === "blink") setBlinkNonce((value) => value + 1);
          if (command.effect === "double-blink") setDoubleBlinkNonce((value) => value + 1);
          if (command.effect === "glitch") setGlitchNonce((value) => value + 1);
          if (command.effect === "degauss") setDegaussNonce((value) => value + 1);
          if (command.effect === "toggle-eye") {
            setState((current) => ({ ...current, eyeVisible: !current.eyeVisible }));
          }
          if (command.effect === "error") {
            setGlitchNonce((value) => value + 1);
            setOverlay({ kind: "error" });
            clearOverlayLater(3200);
          }
          if (command.effect === "clone") {
            setBlinkNonce((value) => value + 1);
            setGlitchNonce((value) => value + 1);
            setOverlay({ kind: "clone" });
            clearOverlayLater(4300);
          }
          if (command.effect === "random-ad" || command.effect === "happy-ad") {
            const happyIndex = 2;
            const index = command.effect === "happy-ad" ? happyIndex : Math.floor(Math.random() * ADVERTISEMENTS.length);
            setProjectorState(null);
            setGlitchNonce((value) => value + 1);
            setOverlay({ kind: "ad", index });
            clearOverlayLater(7800);
          }
          if (command.effect === "interrogation") {
            setBlinkNonce((value) => value + 1);
            setGlitchNonce((value) => value + 1);
            setState((current) => ({ ...current, patrol: false, expression: "suspicious", intensity: 0.95, threat: "RED" }));
            setOverlay({ kind: "interrogation" });
            clearOverlayLater(5400);
          }
          if (command.effect === "drugged") {
            setState((current) => ({ ...current, patrol: false, expression: "drugged", intensity: 1 }));
          }
          if (command.effect === "reset") {
            if (overlayTimerRef.current) window.clearTimeout(overlayTimerRef.current);
            if ("speechSynthesis" in window) window.speechSynthesis.cancel();
            statusLockUntilRef.current = 0;
            lastDirectedGazeRef.current = 0;
            setState(INITIAL_STATE);
            setOverlay({ kind: "none" });
            setProjectorState(null);
            setGlitchNonce((value) => value + 1);
          }
          break;
        }
      }
    },
    [clearOverlayLater, speak],
  );

  useEffect(() => {
    const bus = createCommandBus(
      room,
      applyCommand,
      undefined,
      undefined,
      undefined,
      { displayName, audioRole },
    );
    return () => bus.close();
  }, [room, applyCommand, displayName, audioRole]);

  useEffect(() => {
    if (!state.patrol) return;
    let index = 0;
    const timer = window.setInterval(() => {
      const target = PLAYER_PRESETS[index % PLAYER_PRESETS.length];
      setState((current) => ({
        ...current,
        gaze: { x: target.x, y: target.y, target: target.label },
      }));
      index += 1;
    }, 1900);
    return () => window.clearInterval(timer);
  }, [state.patrol]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (Date.now() < statusLockUntilRef.current) return;
      setState((current) => ({
        ...current,
        status: IDLE_MESSAGES[Math.floor(Math.random() * IDLE_MESSAGES.length)],
      }));
    }, 11000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (state.patrol || overlay.kind !== "none") return;
      if (Date.now() - lastDirectedGazeRef.current < 7000) return;
      setState((current) => ({
        ...current,
        gaze: {
          x: (Math.random() - 0.5) * 0.72,
          y: (Math.random() - 0.5) * 0.3,
          target: "IDLE SCAN",
        },
      }));
    }, 1700);
    return () => window.clearInterval(timer);
  }, [overlay.kind, state.patrol]);

  useEffect(() => {
    let timer = window.setTimeout(function blink() {
      if (overlay.kind === "none") {
        if (Math.random() < 0.18) setDoubleBlinkNonce((value) => value + 1);
        else setBlinkNonce((value) => value + 1);
      }
      timer = window.setTimeout(blink, 2800 + Math.random() * 3800);
    }, 2400 + Math.random() * 2600);
    return () => window.clearTimeout(timer);
  }, [overlay.kind]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const preset = Number(event.key) - 1;
      if (preset >= 0 && preset < PLAYER_PRESETS.length) {
        const target = PLAYER_PRESETS[preset];
        applyCommand({ type: "set-gaze", x: target.x, y: target.y, target: target.label });
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "a") applyCommand({ type: "set-expression", expression: "angry", intensity: 0.9 });
      if (key === "s") applyCommand({ type: "set-expression", expression: "suspicious", intensity: 0.82 });
      if (key === "e") applyCommand({ type: "effect", effect: "error" });
      if (key === "c") applyCommand({ type: "effect", effect: "clone" });
      if (key === "g") applyCommand({ type: "effect", effect: "glitch" });
      if (key === "d") applyCommand({ type: "effect", effect: "degauss" });
      if (key === "i") applyCommand({ type: "effect", effect: "interrogation" });
      if (key === "b") applyCommand({ type: "effect", effect: "random-ad" });
      if (key === "h") applyCommand({ type: "effect", effect: "toggle-eye" });
      if (key === "l") applyCommand({ type: "effect", effect: "drugged" });
      if (key === "p") applyCommand({ type: "set-patrol", enabled: !state.patrol });
      if (key === "f") void toggleFullscreen();
      if (event.key === " ") {
        event.preventDefault();
        applyCommand({ type: "effect", effect: "blink" });
      }
      if (event.key === "Escape") applyCommand({ type: "effect", effect: "reset" });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [applyCommand, state.patrol, toggleFullscreen]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (overlay.kind !== "none") return;
      const x = Math.max(-1, Math.min(1, (event.clientX / window.innerWidth) * 2 - 1));
      const y = Math.max(-1, Math.min(1, (event.clientY / window.innerHeight) * 2 - 1));
      lastDirectedGazeRef.current = Date.now();
      setState((current) => ({ ...current, patrol: false, gaze: { x, y, target: "POINTER" } }));
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, [overlay.kind]);

  const unlockAudio = useCallback(async () => {
    setAudioReady(true);
    setWarmupNonce((value) => value + 1);
    setDegaussNonce((value) => value + 1);

    const fullscreenPromise = document.fullscreenElement
      ? Promise.resolve()
      : document.documentElement.requestFullscreen().catch(() => undefined);
    const wakeLockPromise = acquireWakeLock();

    if (!audioEnabled) {
      await Promise.allSettled([fullscreenPromise, wakeLockPromise]);
      return;
    }

    const start = startAudioRef.current;
    const hum = humAudioRef.current;
    if (!start || !hum) {
      await Promise.allSettled([fullscreenPromise, wakeLockPromise]);
      return;
    }
    start.currentTime = 0;
    hum.currentTime = 0;
    hum.volume = 0;
    await Promise.allSettled([start.play(), hum.play(), fullscreenPromise, wakeLockPromise]);
    window.setTimeout(() => {
      if (humAudioRef.current && audioEnabled) humAudioRef.current.volume = 0.14;
    }, 400);
  }, [acquireWakeLock, audioEnabled]);

  const currentAd = overlay.kind === "ad" ? ADVERTISEMENTS[overlay.index] : null;
  const ambientActive = audioReady && overlay.kind === "none" && !speaking && scenario?.zeroTriggeredAt === null;
  const scenarioRevealing = scenario?.zeroTriggeredAt !== null;

  return (
    <main className={`display-shell ${speaking ? "display-shell--speaking" : ""} ${audioReady ? "display-shell--active" : ""} ${scenario ? "display-shell--scenario" : ""} ${loadingTimer ? "display-shell--loading" : ""}`}>
      <section className={`crt-frame glitch-${glitchNonce % 2}`}>
        <header className="terminal-header">
          <span>AlphaOS v2.0.0-FRIENDSHIP</span>
          <span className={`threat threat--${state.threat.toLowerCase()}`}>THREAT: {state.threat}</span>
          <span className="recording"><i /> REC</span>
        </header>

        <div className="screen-surface">
          <FriendEye
            gazeX={state.gaze.x}
            gazeY={state.gaze.y}
            expression={scenarioRevealing ? "happy" : state.expression}
            intensity={scenarioRevealing ? 0.92 : state.intensity}
            blinkNonce={blinkNonce}
            doubleBlinkNonce={doubleBlinkNonce}
            visible={state.eyeVisible}
            ambient={ambientActive}
          />
          <AmbientIdleEffects active={ambientActive} />
          {loadingTimer ? <LoadingTimerDisplay timer={loadingTimer} /> : null}
          {scenario ? <ScenarioDisplay snapshot={scenario} /> : null}

          {overlay.kind === "error" ? (
            <div className="overlay overlay--error">SYSTEM ERROR<br /><small>REPORT TO NEAREST TERMINATION BOOTH</small></div>
          ) : null}
          {overlay.kind === "clone" ? (
            <div className="overlay overlay--clone">STAND BACK<br /><small>NEW CLONE DELIVERY INCOMING</small></div>
          ) : null}
          {overlay.kind === "interrogation" ? (
            <div className="overlay overlay--interrogation">CITIZEN INTERVIEW IN PROGRESS<br /><small>HONEST CITIZENS ENJOY QUESTIONS</small></div>
          ) : null}
          {currentAd ? (
            <div className="ad-overlay">
              <div className="ad-copy">
                <span>ALPHA COMPLEX APPROVED PRODUCT</span>
                <h2>{currentAd.product}</h2>
                <strong>{currentAd.main}</strong>
                <p>{currentAd.sub}</p>
                <small>{currentAd.mini}</small>
              </div>
              <div className="ad-media">
                <Image
                  src={currentAd.image}
                  alt={`${currentAd.product} propaganda poster`}
                  width={currentAd.imageWidth}
                  height={currentAd.imageHeight}
                  priority={false}
                />
                <div className="ad-seal" aria-hidden="true"><span>FC</span><small>APPROVED</small></div>
              </div>
            </div>
          ) : null}
          {projectorState ? <ProjectorStateOverlay state={projectorState} /> : null}

          <div className={`status-line ${scenario ? "status-line--scenario" : ""}`}>{state.status}</div>
          <div className="scanlines" />
          <div className="phosphor-mask" />
          <div className="glass-vignette" />
          {degaussNonce ? <div key={`degauss-${degaussNonce}`} className="degauss-pulse" /> : null}
          {warmupNonce ? <div key={`warmup-${warmupNonce}`} className="crt-warmup" /> : null}
        </div>
      </section>

      {!audioReady ? (
        <button type="button" className="audio-unlock" onClick={unlockAudio}>
          INITIALIZE FRIEND COMPUTER
          <small>{audioEnabled ? "click once to enable primary audio, fullscreen, and observation" : "visual-only display · click once for fullscreen and observation"}</small>
        </button>
      ) : null}

      <div className="display-debug">
        {displayName.toUpperCase()} · {audioEnabled ? "PRIMARY AUDIO" : "VISUAL ONLY"} · ROOM {room.toUpperCase()} · M SETTINGS · Q JOIN QR · F FULLSCREEN · ESC RESET
      </div>
    </main>
  );
}
