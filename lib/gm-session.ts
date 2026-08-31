"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "friend-computer-gm-session:v1";
export const GM_SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

type StoredGmSession = {
  version: 1;
  gmKey: string;
  expiresAt: number;
};

function loadStoredSession() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredGmSession>;
    if (parsed.version !== 1 || typeof parsed.gmKey !== "string" || !parsed.gmKey.trim() || typeof parsed.expiresAt !== "number" || parsed.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.gmKey;
  } catch {
    return null;
  }
}

function storeSession(gmKey: string) {
  const normalized = gmKey.trim();
  if (!normalized) return;
  const session: StoredGmSession = {
    version: 1,
    gmKey: normalized,
    expiresAt: Date.now() + GM_SESSION_DURATION_MS,
  };
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Authorization still works for the current page when session storage is blocked.
  }
}

export function useGmSession() {
  const [gmKey, setGmKey] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [restoredFromSession, setRestoredFromSession] = useState(false);

  useEffect(() => {
    const storedKey = loadStoredSession();
    if (storedKey) {
      setGmKey(storedKey);
      setRestoredFromSession(true);
    }
    setSessionReady(true);
  }, []);

  const rememberGmKey = useCallback((acceptedKey = gmKey) => {
    storeSession(acceptedKey);
  }, [gmKey]);

  return { gmKey, setGmKey, rememberGmKey, sessionReady, restoredFromSession };
}
