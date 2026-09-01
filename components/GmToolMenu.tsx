"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  readRehearsalSession,
  rehearsalStorageKey,
  REHEARSAL_STATE_EVENT,
} from "@/lib/rehearsal";

type ToolDefinition = {
  route: string;
  label: string;
  description: string;
};

type ToolGroup = {
  label: string;
  tools: ToolDefinition[];
};

const TOOL_GROUPS: ToolGroup[] = [
  {
    label: "RUN GAME",
    tools: [
      { route: "mission", label: "Mission Director", description: "Run scenes, scripted cues, mission timers, and projector states." },
      { route: "control", label: "Manual Controls", description: "Direct the eye, speech, effects, loading timer, and emergency reset." },
      { route: "copilot", label: "AI Copilot", description: "Ask Friend Computer for live assistance and display-safe responses." },
    ],
  },
  {
    label: "BUILD & PREP",
    tools: [
      { route: "importer", label: "Story Importer", description: "Convert pasted or uploaded story text into a review-first mission draft." },
      { route: "workshop", label: "Mission Workshop", description: "Create, validate, preview, save, and download portable missions." },
      { route: "handoff", label: "GM Handoff", description: "Package a safe mission setup for another GM or restore one into a new room." },
      { route: "rehearsal", label: "Rehearsal Mode", description: "Practice missions on an isolated simulated projector with no live writes." },
    ],
  },
  {
    label: "COMMUNICATIONS",
    tools: [
      { route: "messages", label: "Private Messaging", description: "Open GM-to-player channels, create inbox links, and manage privacy controls." },
      { route: "communications", label: "Citizen Communications", description: "Manage citizens, notices, invitations, and player contact." },
    ],
  },
  {
    label: "MISSION RECORDS",
    tools: [
      { route: "session", label: "Mission Context", description: "Edit what Friend Computer and the Copilot know about the current game." },
      { route: "log", label: "Session Log", description: "Record discoveries, accusations, clones, secrets, and outcomes." },
    ],
  },
  {
    label: "SETUP",
    tools: [
      { route: "readiness", label: "Show Readiness", description: "Check displays, primary audio, network services, and browser capabilities." },
      { route: "join", label: "Room Join Menu", description: "Open the room checkpoint for displays and other GM devices." },
    ],
  },
];

const ALL_TOOLS = TOOL_GROUPS.flatMap((group) => group.tools);
const FALLBACK_TOOL: ToolDefinition = {
  route: "mission",
  label: "GM Console",
  description: "Choose a game-running, communications, records, or setup tool.",
};

export function GmToolMenu({ room }: { room: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [rehearsalActive, setRehearsalActive] = useState(false);
  const currentTool = ALL_TOOLS.find((tool) => pathname.startsWith(`/${tool.route}/`)) ?? FALLBACK_TOOL;

  useEffect(() => {
    const update = () => {
      try {
        setRehearsalActive(Boolean(readRehearsalSession(room)?.active));
      } catch {
        setRehearsalActive(false);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === rehearsalStorageKey(room)) update();
    };
    const onRehearsalState = (event: Event) => {
      const detail = (event as CustomEvent<{ room?: string }>).detail;
      if (!detail?.room || detail.room === room) update();
    };
    update();
    window.addEventListener("storage", onStorage);
    window.addEventListener(REHEARSAL_STATE_EVENT, onRehearsalState);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(REHEARSAL_STATE_EVENT, onRehearsalState);
    };
  }, [room]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <>
      {rehearsalActive ? (
        <Link className="rehearsal-global-banner" href={`/rehearsal/${encodeURIComponent(room)}`}>
          <strong>REHEARSAL ACTIVE</strong>
          <span>ROOM {room.toUpperCase()} · LIVE CONTEXT, LOGS, MESSAGES, NOTICES, AND DISPLAYS ARE ISOLATED</span>
          <small>RETURN TO REHEARSAL →</small>
        </Link>
      ) : null}
      <aside className="gm-tool-dock" aria-label={`Current GM tool: ${currentTool.label}`}>
        <div className="gm-tool-dock__context">
          <span>YOU ARE HERE</span>
          <strong>{currentTool.label}</strong>
          <small>{currentTool.description}</small>
        </div>
        <button
          type="button"
          className="gm-tool-dock__button"
          aria-expanded={open}
          aria-controls="gm-tool-dialog"
          onClick={() => setOpen(true)}
        >
          ☰ ALL GM TOOLS
        </button>
      </aside>

      {open ? (
        <div
          id="gm-tool-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="GM tools menu"
          className="gm-tool-dialog"
          onClick={() => setOpen(false)}
        >
          <div className="panel gm-tool-dialog__panel" onClick={(event) => event.stopPropagation()}>
            <header className="gm-tool-dialog__header">
              <div>
                <span>ROOM {room.toUpperCase()}</span>
                <h2>GM Console</h2>
                <p>Choose what you need to do. Your current tool is highlighted.</p>
              </div>
              <button type="button" className="gm-tool-dialog__close" aria-label="Close GM tools" onClick={() => setOpen(false)}>×</button>
            </header>

            <div className="gm-tool-groups">
              {TOOL_GROUPS.map((group) => {
                const headingId = `gm-group-${group.label.replaceAll(" ", "-").toLowerCase()}`;
                return (
                  <section className="gm-tool-group" key={group.label} aria-labelledby={headingId}>
                    <h3 id={headingId}>{group.label}</h3>
                    <div className="gm-tool-group__links">
                      {group.tools.map((tool) => {
                        const href = `/${tool.route}/${encodeURIComponent(room)}`;
                        const active = tool.route === currentTool.route;
                        return (
                          <Link
                            key={tool.route}
                            href={href}
                            aria-current={active ? "page" : undefined}
                            className={`gm-tool-link${active ? " gm-tool-link--active" : ""}`}
                            onClick={() => setOpen(false)}
                          >
                            <strong>{tool.label}</strong>
                            <span>{tool.description}</span>
                            <small>{active ? "CURRENT TOOL" : "OPEN TOOL →"}</small>
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>

            <footer className="gm-tool-dialog__footer">
              <Link className="display-link" href={`/display/${encodeURIComponent(room)}`} target="_blank" rel="noreferrer">
                OPEN PROJECTOR DISPLAY ↗
              </Link>
              <button type="button" onClick={() => setOpen(false)}>RETURN TO {currentTool.label.toUpperCase()}</button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
