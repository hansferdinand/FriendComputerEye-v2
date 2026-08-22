export type DisplayAudioRole = "primary" | "visual";

export type DisplayConfig = {
  deviceId: string;
  name: string;
  audioRole: DisplayAudioRole;
  configured: boolean;
};

const STORAGE_KEY = "friend-computer-display-config:v1";

function createDeviceId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function defaultName(deviceId: string) {
  return `DISPLAY-${deviceId.replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase() || "0000"}`;
}

export function createDefaultDisplayConfig(): DisplayConfig {
  const deviceId = createDeviceId();
  return {
    deviceId,
    name: defaultName(deviceId),
    audioRole: "visual",
    configured: false,
  };
}

export function loadDisplayConfig(): DisplayConfig {
  const fallback = createDefaultDisplayConfig();
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<DisplayConfig>;
    const deviceId = typeof parsed.deviceId === "string" && parsed.deviceId.trim() ? parsed.deviceId : fallback.deviceId;
    const name = typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim().slice(0, 40) : defaultName(deviceId);
    const audioRole: DisplayAudioRole = parsed.audioRole === "primary" ? "primary" : "visual";
    return { deviceId, name, audioRole, configured: parsed.configured === true };
  } catch {
    return fallback;
  }
}

export function saveDisplayConfig(config: DisplayConfig) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}
