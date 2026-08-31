"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { JoinGmQr } from "@/components/JoinGmQr";

function createRoomCode() {
  const roomNumber = crypto.getRandomValues(new Uint16Array(1))[0] % 10_000;
  return roomNumber.toString().padStart(4, "0");
}

function sanitizeRoom(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 40);
}

export default function Home() {
  const [room, setRoom] = useState("alpha");
  const [roomLoaded, setRoomLoaded] = useState(false);

  useEffect(() => {
    const savedRoom = window.localStorage.getItem("friend-computer-room");
    if (savedRoom) setRoom(sanitizeRoom(savedRoom));
    setRoomLoaded(true);
  }, []);

  useEffect(() => {
    if (roomLoaded && room) window.localStorage.setItem("friend-computer-room", room);
  }, [room, roomLoaded]);

  const roomReady = room.length > 0;
  const fieldStyle = {
    width: "100%",
    marginTop: 8,
    padding: "12px 14px",
    border: "1px solid #27646a",
    background: "#020607",
    color: "#dcfcff",
    font: "inherit",
  } as const;

  const buttonStyle = {
    marginTop: 10,
    padding: "10px 13px",
    border: "1px solid #27646a",
    background: "#071214",
    color: "#8feff4",
    font: "inherit",
    cursor: "pointer",
  } as const;

  return (
    <main className="landing-shell">
      <section className="landing-card">
        <div className="landing-eyebrow">ALPHA COMPLEX TERMINAL</div>
        <h1>Friend Computer v2</h1>
        <p>
          The Computer is your friend. Failure to connect to your friend may indicate treason,
          network congestion, or insufficient happiness.
        </p>

        <label>
          <small>SESSION ROOM</small>
          <input
            aria-label="Session room code"
            value={room}
            onChange={(event) => setRoom(sanitizeRoom(event.target.value))}
            placeholder="alpha"
            style={fieldStyle}
          />
        </label>
        <button type="button" onClick={() => setRoom(createRoomCode())} style={buttonStyle}>
          NEW 4-DIGIT ROOM
        </button>

        <div className="landing-actions">
          {roomReady ? <Link href={`/display/${encodeURIComponent(room)}`}>Open Display</Link> : null}
          {roomReady ? <Link href={`/control/${encodeURIComponent(room)}`}>Open GM Control</Link> : null}
        </div>

        {roomReady ? <JoinGmQr room={room} compact /> : null}

        <small style={{ display: "block", marginTop: 16 }}>
          Milestone 2 · Supabase Realtime across devices · local BroadcastChannel fallback remains active
        </small>
      </section>
    </main>
  );
}
