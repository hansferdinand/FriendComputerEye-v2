"use client";

import type { CommandEnvelope, FriendCommand } from "@/lib/friend-computer";

const CHANNEL_PREFIX = "friend-computer-v2";

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizedRoomName(room: string) {
  return room.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-") || "alpha";
}

export type CommandBus = {
  send: (command: FriendCommand) => void;
  close: () => void;
  transport: "broadcast" | "storage" | "none";
};

export function createCommandBus(
  room: string,
  onCommand?: (command: FriendCommand) => void,
): CommandBus {
  const normalizedRoom = normalizedRoomName(room);
  const channelName = `${CHANNEL_PREFIX}:${normalizedRoom}`;
  const storageKey = `${channelName}:event`;
  const seen = new Set<string>();
  let channel: BroadcastChannel | null = null;
  let storageAvailable = false;

  const remember = (id: string) => {
    seen.add(id);
    if (seen.size > 250) {
      const oldest = seen.values().next().value as string | undefined;
      if (oldest) seen.delete(oldest);
    }
  };

  const receive = (envelope: CommandEnvelope | null | undefined) => {
    if (!envelope?.id || !envelope.command || seen.has(envelope.id)) return;
    remember(envelope.id);
    onCommand?.(envelope.command);
  };

  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(channelName);
      channel.onmessage = (event: MessageEvent<CommandEnvelope>) => receive(event.data);
    } catch {
      channel = null;
    }
  }

  try {
    const probeKey = `${storageKey}:probe`;
    window.localStorage.setItem(probeKey, "1");
    window.localStorage.removeItem(probeKey);
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey || !event.newValue) return;
    try {
      receive(JSON.parse(event.newValue) as CommandEnvelope);
    } catch {
      // Ignore malformed or stale localStorage events.
    }
  };

  if (storageAvailable) window.addEventListener("storage", onStorage);

  return {
    transport: channel ? "broadcast" : storageAvailable ? "storage" : "none",
    send(command) {
      const envelope: CommandEnvelope = {
        id: createId(),
        issuedAt: Date.now(),
        command,
      };
      remember(envelope.id);
      channel?.postMessage(envelope);
      if (storageAvailable) {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(envelope));
          window.localStorage.removeItem(storageKey);
        } catch {
          // BroadcastChannel may still have delivered the command.
        }
      }
    },
    close() {
      channel?.close();
      if (storageAvailable) window.removeEventListener("storage", onStorage);
    },
  };
}
