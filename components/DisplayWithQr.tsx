"use client";

import { useEffect, useState } from "react";
import { FriendComputerDisplay } from "@/components/FriendComputerDisplay";
import { JoinGmQr } from "@/components/JoinGmQr";

export function DisplayWithQr({ room }: { room: string }) {
  const [showQr, setShowQr] = useState(false);
  const [showHint, setShowHint] = useState(true);

  useEffect(() => {
    const hintTimer = window.setTimeout(() => setShowHint(false), 9000);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "q") {
        event.preventDefault();
        setShowQr((value) => !value);
        setShowHint(false);
      } else if (event.key === "Escape" && showQr) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setShowQr(false);
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.clearTimeout(hintTimer);
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [showQr]);

  return (
    <>
      <FriendComputerDisplay room={room} />

      {showHint && !showQr ? (
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
          PRESS Q · JOIN GM QR
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
