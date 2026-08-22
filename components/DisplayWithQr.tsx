"use client";

import { useEffect, useState } from "react";
import { FriendComputerDisplay } from "@/components/FriendComputerDisplay";
import { JoinGmQr } from "@/components/JoinGmQr";
import {
  loadDisplayConfig,
  saveDisplayConfig,
  type DisplayAudioRole,
  type DisplayConfig,
} from "@/lib/display-config";

const INITIAL_CONFIG: DisplayConfig = {
  deviceId: "pending",
  name: "DISPLAY",
  audioRole: "visual",
  configured: false,
};

export function DisplayWithQr({ room }: { room: string }) {
  const [showQr, setShowQr] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [configReady, setConfigReady] = useState(false);
  const [config, setConfig] = useState<DisplayConfig>(INITIAL_CONFIG);
  const [showSettings, setShowSettings] = useState(false);
  const [draftName, setDraftName] = useState("DISPLAY");
  const [draftRole, setDraftRole] = useState<DisplayAudioRole>("visual");

  useEffect(() => {
    const loaded = loadDisplayConfig();
    setConfig(loaded);
    setDraftName(loaded.name);
    setDraftRole(loaded.audioRole);
    setShowSettings(!loaded.configured);
    setConfigReady(true);
  }, []);

  useEffect(() => {
    const hintTimer = window.setTimeout(() => setShowHint(false), 9000);
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "m") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setDraftName(config.name);
        setDraftRole(config.audioRole);
        setShowSettings((value) => !value);
        setShowQr(false);
        setShowHint(false);
      } else if (key === "q") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setShowQr((value) => !value);
        setShowSettings(false);
        setShowHint(false);
      } else if (event.key === "Escape" && (showQr || showSettings)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setShowQr(false);
        if (config.configured) setShowSettings(false);
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.clearTimeout(hintTimer);
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [config, showQr, showSettings]);

  const openSettings = () => {
    setDraftName(config.name);
    setDraftRole(config.audioRole);
    setShowSettings(true);
    setShowQr(false);
    setShowHint(false);
  };

  const saveSettings = () => {
    const name = draftName.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 40) || config.name;
    const next: DisplayConfig = {
      ...config,
      name,
      audioRole: draftRole,
      configured: true,
    };
    saveDisplayConfig(next);
    setConfig(next);
    setDraftName(next.name);
    setShowSettings(false);
  };

  return (
    <>
      <FriendComputerDisplay room={room} displayName={config.name} audioRole={config.audioRole} />

      {configReady ? (
        <button
          type="button"
          onClick={openSettings}
          title="Display settings (M)"
          style={{
            position: "fixed",
            left: 14,
            top: 54,
            zIndex: 106,
            padding: "7px 9px",
            border: `1px solid ${config.audioRole === "primary" ? "#48f6ff" : "#27646a"}`,
            background: "rgba(1, 10, 12, .78)",
            color: config.audioRole === "primary" ? "#87f6fb" : "#7aa9ad",
            font: "10px/1.15 'Courier New', monospace",
            letterSpacing: ".06em",
            cursor: "pointer",
            opacity: .82,
          }}
        >
          {config.name.toUpperCase()} · {config.audioRole === "primary" ? "AUDIO" : "VISUAL"}
        </button>
      ) : null}

      {showHint && !showQr && !showSettings ? (
        <div
          style={{
            position: "fixed",
            right: 18,
            top: 54,
            zIndex: 105,
            padding: "8px 10px",
            border: "1px solid #27646a",
            background: "rgba(1, 10, 12, .86)",
            color: "#85e8ed",
            font: "11px/1.2 'Courier New', monospace",
            letterSpacing: ".08em",
            pointerEvents: "none",
          }}
        >
          PRESS M · DISPLAY SETUP<br />PRESS Q · JOIN GM QR
        </div>
      ) : null}

      {showSettings ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Display Configuration"
          onClick={() => config.configured && setShowSettings(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 120,
            display: "grid",
            placeItems: "center",
            padding: 20,
            background: "rgba(0, 5, 6, .95)",
            backdropFilter: "blur(9px)",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(520px, 94vw)",
              border: "1px solid #27646a",
              background: "#071214",
              padding: 20,
              color: "#dcfcff",
              fontFamily: "'Courier New', monospace",
              boxShadow: "0 0 60px rgba(72,246,255,.10)",
            }}
          >
            <small style={{ color: "#6e9499", letterSpacing: ".12em" }}>ALPHA COMPLEX DISPLAY TERMINAL</small>
            <h2 style={{ margin: "8px 0 6px" }}>Display Configuration</h2>
            <p style={{ color: "#9dbdc0", fontSize: 12, lineHeight: 1.45, marginTop: 0 }}>
              Give this physical screen a recognizable name. Exactly one display should normally be PRIMARY AUDIO; every other screen should be VISUAL ONLY.
            </p>

            <label style={{ display: "grid", gap: 6, color: "#8fbfc3", fontSize: 11 }}>
              DISPLAY NAME
              <input
                value={draftName}
                maxLength={40}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="LIVING ROOM TV"
                style={{ padding: 12, font: "14px 'Courier New', monospace" }}
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, marginTop: 14 }}>
              <button
                type="button"
                onClick={() => setDraftRole("primary")}
                style={{
                  padding: 14,
                  minHeight: 92,
                  textAlign: "left",
                  border: `1px solid ${draftRole === "primary" ? "#48f6ff" : "#27646a"}`,
                  background: draftRole === "primary" ? "#082529" : "#020607",
                  color: draftRole === "primary" ? "#87f6fb" : "#9bbdc0",
                  cursor: "pointer",
                  fontFamily: "'Courier New', monospace",
                }}
              >
                <strong>PRIMARY AUDIO</strong><br />
                <small>Speaks Friend Computer replies and plays CRT sound. Use on one screen only.</small>
              </button>
              <button
                type="button"
                onClick={() => setDraftRole("visual")}
                style={{
                  padding: 14,
                  minHeight: 92,
                  textAlign: "left",
                  border: `1px solid ${draftRole === "visual" ? "#48f6ff" : "#27646a"}`,
                  background: draftRole === "visual" ? "#082529" : "#020607",
                  color: draftRole === "visual" ? "#87f6fb" : "#9bbdc0",
                  cursor: "pointer",
                  fontFamily: "'Courier New', monospace",
                }}
              >
                <strong>VISUAL ONLY</strong><br />
                <small>Receives every visual command but remains silent. Safe default for extra screens.</small>
              </button>
            </div>

            <button
              type="button"
              onClick={saveSettings}
              style={{
                width: "100%",
                marginTop: 14,
                padding: 13,
                border: "1px solid #48f6ff",
                background: "#48f6ff",
                color: "#001315",
                font: "900 12px 'Courier New', monospace",
                letterSpacing: ".08em",
                cursor: "pointer",
              }}
            >
              SAVE DISPLAY CONFIGURATION
            </button>
            <div style={{ marginTop: 10, color: "#6e9499", fontSize: 10, lineHeight: 1.4 }}>
              Stored only in this browser. Press M or tap the display badge to change it later.
            </div>
          </div>
        </div>
      ) : null}

      {showQr ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Join GM Console"
          onClick={() => setShowQr(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 110,
            display: "grid",
            placeItems: "center",
            padding: 24,
            background: "rgba(0, 5, 6, .93)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div onClick={(event) => event.stopPropagation()} style={{ width: "min(420px, 90vw)" }}>
            <JoinGmQr room={room} />
            <button
              type="button"
              onClick={() => setShowQr(false)}
              style={{
                width: "100%",
                marginTop: 10,
                padding: 12,
                border: "1px solid #27646a",
                background: "#020607",
                color: "#9cf5f8",
                font: "700 12px 'Courier New', monospace",
                letterSpacing: ".08em",
                cursor: "pointer",
              }}
            >
              CLOSE · Q / ESC
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
