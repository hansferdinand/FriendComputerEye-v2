import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = "https://jtbmzdydmxettzqmzgoz.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0Ym16ZHlkbXhldHR6cW16Z296Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMDExOTgsImV4cCI6MjA5OTU3NzE5OH0.PpfObycaMGjH0WizQ--BoPyZrORSewV4g2P8Pq-s7Fg";
const topic = `friend-computer-v2:ci-${randomUUID()}`;
const event = "command";

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

const sender = createClient(url, key, clientOptions);
const receiver = createClient(url, key, clientOptions);

const senderChannel = sender.channel(topic, { config: { broadcast: { ack: true, self: false } } });
const receiverChannel = receiver.channel(topic, { config: { broadcast: { ack: true, self: false } } });

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

const received = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("Realtime command was not received")), 12_000);
  receiverChannel.on("broadcast", { event }, ({ payload }) => {
    if (payload?.command?.type === "set-status" && payload.command.text === "CI REALTIME TEST") {
      clearTimeout(timeout);
      resolve(payload);
    }
  });
});

try {
  await Promise.all([subscribe(receiverChannel, "receiver"), subscribe(senderChannel, "sender")]);

  const response = await senderChannel.send({
    type: "broadcast",
    event,
    payload: {
      id: randomUUID(),
      issuedAt: Date.now(),
      command: { type: "set-status", text: "CI REALTIME TEST" },
    },
  });

  if (response !== "ok") throw new Error(`Realtime send returned: ${response}`);
  await received;
  console.log(`Supabase Realtime smoke test passed on ${topic}`);
} finally {
  await Promise.allSettled([
    sender.removeChannel(senderChannel),
    receiver.removeChannel(receiverChannel),
  ]);
}
