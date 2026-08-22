"use client";

import Link from "next/link";
import { useState } from "react";

export function GmToolMenu({ room }: { room: string }) {
  const [open, setOpen] = useState(false);
  const items = [
    ["MISSION DIRECTOR", `/mission/${encodeURIComponent(room)}`],
    ["AI COPILOT", `/copilot/${encodeURIComponent(room)}`],
    ["CITIZEN COMMUNICATIONS", `/communications/${encodeURIComponent(room)}`],
    ["SESSION LOG", `/log/${encodeURIComponent(room)}`],
    ["MISSION CONTEXT", `/session/${encodeURIComponent(room)}`],
    ["SHOW READINESS", `/readiness/${encodeURIComponent(room)}`],
    ["ROOM JOIN MENU", `/join/${encodeURIComponent(room)}`],
  ] as const;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          right: 16,
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
        ☰ GM TOOLS
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="GM tools menu"
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 140, display: "grid", placeItems: "center", padding: 20, background: "rgba(0,5,6,.88)", backdropFilter: "blur(7px)" }}
        >
          <div className="panel" onClick={(event) => event.stopPropagation()} style={{ width: "min(560px,95vw)", margin: 0 }}>
            <div className="panel-heading"><span>☰</span><h2>GM Tools</h2></div>
            <div style={{ color: "#8fbfc3", fontSize: 11, marginBottom: 10 }}>ROOM {room.toUpperCase()}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 8 }}>
              {items.map(([label, href]) => (
                <Link key={href} className="display-link" href={href} onClick={() => setOpen(false)} style={{ textAlign: "center", padding: 12 }}>
                  {label}
                </Link>
              ))}
              <Link className="display-link" href={`/display/${encodeURIComponent(room)}`} target="_blank" style={{ textAlign: "center", padding: 12 }}>
                OPEN DISPLAY ↗
              </Link>
            </div>
            <button type="button" onClick={() => setOpen(false)} style={{ width: "100%", marginTop: 12 }}>CLOSE</button>
          </div>
        </div>
      ) : null}
    </>
  );
}
