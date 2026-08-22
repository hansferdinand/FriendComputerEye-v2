import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = "https://jtbmzdydmxettzqmzgoz.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0Ym16ZHlkbXhldHR6cW16Z296Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMDExOTgsImV4cCI6MjA5OTU3NzE5OH0.PpfObycaMGjH0WizQ--BoPyZrORSewV4g2P8Pq-s7Fg";
const topic = `friend-computer-v2:ci-${randomUUID()}`;
const commandEvent = "command";
const receiptEvent = "receipt";
const commandId = randomUUID();

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

const controller = createClient(url, key, clientOptions);
const display = createClient(url, key, clientOptions);

const controllerChannel = controller.channel(topic, {
  config: {
    broadcast: { ack: true, self: false },
    presence: { key: `control-${randomUUID()}` },
  },
});
const displayChannel = display.channel(topic, {
  config: {
    broadcast: { ack: true, self: false },
    presence: { key: `display-${randomUUID()}` },
  },
});

function subscribe(channel, label) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} subscription timed out`)), 12_000);
    channel.subscribe((status, error) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        reject(error ?? new Error(`${label} subscription failed: ${status}`));
      }
    });
  });
}

const commandReceived = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("Display did not receive Realtime command")), 12_000);
  displayChannel.on("broadcast", { event: commandEvent }, async ({ payload }) => {
    if (payload?.id !== commandId || payload?.command?.type !== "set-status") return;
    clearTimeout(timeout);

    const receiptResponse = await displayChannel.send({
      type: "broadcast",
      event: receiptEvent,
      payload: { id: payload.id, receivedAt: Date.now() },
    });
    if (receiptResponse !== "ok") {
      reject(new Error(`Display receipt send returned: ${receiptResponse}`));
      return;
    }
    resolve(payload);
  });
});

const receiptReceived = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("Controller did not receive display receipt")), 12_000);
  controllerChannel.on("broadcast", { event: receiptEvent }, ({ payload }) => {
    if (payload?.id !== commandId) return;
    clearTimeout(timeout);
    resolve(payload);
  });
});

const presenceVisible = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("Realtime presence did not show both display and control")), 12_000);
  controllerChannel.on("presence", { event: "sync" }, () => {
    const state = controllerChannel.presenceState();
    const roles = Object.values(state)
      .flat()
      .map((entry) => entry.role)
      .filter(Boolean);

    if (roles.includes("display") && roles.includes("control")) {
      clearTimeout(timeout);
      resolve(roles);
    }
  });
});

try {
  await Promise.all([subscribe(controllerChannel, "controller"), subscribe(displayChannel, "display")]);

  const [controlTrack, displayTrack] = await Promise.all([
    controllerChannel.track({ role: "control", joinedAt: Date.now() }),
    displayChannel.track({ role: "display", joinedAt: Date.now() }),
  ]);
  if (displayTrack !== "ok" || controlTrack !== "ok") {
    throw new Error(`Presence tracking failed: display=${displayTrack}, control=${controlTrack}`);
  }

  await presenceVisible;

  const response = await controllerChannel.send({
    type: "broadcast",
    event: commandEvent,
    payload: {
      id: commandId,
      issuedAt: Date.now(),
      command: { type: "set-status", text: "CI REALTIME TEST" },
    },
  });

  if (response !== "ok") throw new Error(`Realtime send returned: ${response}`);
  await Promise.all([commandReceived, receiptReceived]);
  console.log(`Supabase Realtime presence + command + receipt smoke test passed on ${topic}`);
} finally {
  await Promise.allSettled([
    controller.removeChannel(controllerChannel),
    display.removeChannel(displayChannel),
  ]);
}
