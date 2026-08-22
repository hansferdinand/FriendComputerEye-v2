"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AICopilotPanel } from "@/components/AICopilotPanel";
import { PLAYER_PRESETS, type FriendCommand } from "@/lib/friend-computer";
import { createCommandBus, type CommandBus, type RoomPresence } from "@/lib/transport";

const PLAYER_STORAGE_KEY = "friend-computer-v2:player-names:v1";

function readPlayerNames() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PLAYER_STORAGE_KEY) ?? "null") as unknown;
    if (Array.isArray(saved) && saved.length === PLAYER_PRESETS.length && saved.every((item) => typeof item === "string")) {
      return saved as string[];
    }
  } catch {
    // Defaults are fine; player labels are only context for the copilot.
  }
  return PLAYER_PRESETS.map((preset) => preset.label);
}

export function AICopilotDock({ room }: { room: string }) {
  const busRef = useRef<CommandBus | null>(null);
  const [transport, setTransport] = useState<CommandBus["transport"]>("connecting");
  const [presence, setPresence] = useState<RoomPresence>({ displays: 0, controls: 0 });
  const [playerNames, setPlayerNames] = useState<string[]>(() => PLAYER_PRESETS.map((preset) => preset.label));

  useEffect(() => {
    setPlayerNames(readPlayerNames());
    const timer = window.setInterval(() => setPlayerNames(readPlayerNames()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const bus = createCommandBus(room, undefined, setTransport, setPresence);
    busRef.current = bus;
    return () => {
      bus.close();
      busRef.current = null;
    };
  }, [room]);

  const sendCommand = useCallback((command: FriendCommand) => {
    busRef.current?.send(command);
  }, []);

  const displayOnline = transport === "realtime" && presence.displays > 0;

  return (
    <div className="control-shell" style={{ minHeight: 0, paddingBottom: 0 }}>
      <div className="control-grid">
        <AICopilotPanel
          room={room}
          playerNames={playerNames}
          displayOnline={displayOnline}
          sendCommand={sendCommand}
        />
      </div>
    </div>
  );
}
