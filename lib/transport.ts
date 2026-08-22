"use client";

import type { CommandEnvelope, FriendCommand } from "@/lib/friend-computer";
import { getSupabaseClient } from "@/lib/supabase-client";

const CHANNEL_PREFIX = "friend-computer-v2";
const REMOTE_EVENT = "command";

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizedRoomName(room: string) {
  return room.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-") || "alpha";
}

export type TransportKind = "connecting" | "realtime" | "broadcast" | "storage" | "none";
export type PresenceRole = "display" | "control";
export type RoomPresence = { displays: number; controls: number };

export type CommandBus = {
  send: (command: FriendCommand) => void;
  close: () => void;
  readonly transport: TransportKind;
};

export function createCommandBus(
  room: string,
  onCommand?: (command: FriendCommand) => void,
  onTransportChange?: (transport: TransportKind) => void,
  onPresenceChange?: (presence: RoomPresence) => void,
): CommandBus {
  const normalizedRoom = normalizedRoomName(room);
  const channelName = `${CHANNEL_PREFIX}:${normalizedRoom}`;
  const storageKey = `${channelName}:event`;
  const seen = new Set<string>();
  const presenceKey = createId();
  const role: PresenceRole = onCommand ? "display" : "control";
  let channel: BroadcastChannel | null = null;
  let storageAvailable = false;
  let remoteConnected = false;
  let closed = false;

  const localTransport = () =>
    channel ? ("broadcast" as const) : storageAvailable ? ("storage" as const) : ("none" as const);

  const currentTransport = (): TransportKind => {
    if (remoteConnected) return "realtime";
    return localTransport();
  };

  const emitTransport = () => {
    if (!closed) onTransportChange?.(currentTransport());
  };

  const emitNoPresence = () => {
    if (!closed) onPresenceChange?.({ displays: 0, controls: 0 });
  };

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

  const supabase = getSupabaseClient();
  let remoteChannel: ReturnType<typeof supabase.channel>;

  const emitPresence = () => {
    if (closed || !onPresenceChange) return;
    const state = remoteChannel.presenceState();
    let displays = 0;
    let controls = 0;

    for (const entries of Object.values(state)) {
      for (const entry of entries as Array<Record<string, unknown>>) {
        if (entry.role === "display") displays += 1;
        if (entry.role === "control") controls += 1;
      }
    }

    onPresenceChange({ displays, controls });
  };

  remoteChannel = supabase
    .channel(channelName, {
      config: {
        broadcast: { ack: true, self: false },
        presence: { key: presenceKey },
      },
    })
    .on("broadcast", { event: REMOTE_EVENT }, (payload) => {
      receive(payload.payload as CommandEnvelope);
    })
    .on("presence", { event: "sync" }, emitPresence)
    .subscribe((status) => {
      if (closed) return;
      remoteConnected = status === "SUBSCRIBED";
      emitTransport();

      if (remoteConnected) {
        void remoteChannel.track({ role, joinedAt: Date.now() });
      } else {
        emitNoPresence();
      }
    });

  onTransportChange?.("connecting");
  emitNoPresence();

  return {
    get transport() {
      return remoteConnected ? "realtime" : localTransport();
    },
    send(command) {
      const envelope: CommandEnvelope = {
        id: createId(),
        issuedAt: Date.now(),
        command,
      };
      remember(envelope.id);

      // Same-device delivery remains first and independent of the network.
      channel?.postMessage(envelope);
      if (storageAvailable) {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(envelope));
          window.localStorage.removeItem(storageKey);
        } catch {
          // BroadcastChannel or Realtime may still have delivered the command.
        }
      }

      // Supabase Broadcast adds cross-device delivery. If the socket has not
      // subscribed yet, supabase-js transparently falls back to HTTP delivery.
      void remoteChannel
        .send({
          type: "broadcast",
          event: REMOTE_EVENT,
          payload: envelope,
        })
        .then((result) => {
          if (result === "ok") return;
          remoteConnected = false;
          emitTransport();
          emitNoPresence();
        })
        .catch(() => {
          remoteConnected = false;
          emitTransport();
          emitNoPresence();
        });
    },
    close() {
      closed = true;
      channel?.close();
      if (storageAvailable) window.removeEventListener("storage", onStorage);
      void supabase.removeChannel(remoteChannel);
    },
  };
}
