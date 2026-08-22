"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./AmbientIdleEffects.module.css";

type AmbientEffect = "static" | "roll" | "flicker" | "none";

function pickEffect(): AmbientEffect {
  const roll = Math.random();
  if (roll < 0.34) return "static";
  if (roll < 0.52) return "flicker";
  if (roll < 0.64) return "roll";
  return "none";
}

export function AmbientIdleEffects({ active }: { active: boolean }) {
  const [staticNonce, setStaticNonce] = useState(0);
  const [rollNonce, setRollNonce] = useState(0);
  const [flickerNonce, setFlickerNonce] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      return;
    }

    let cancelled = false;

    const schedule = (initial = false) => {
      const delay = initial
        ? 2400 + Math.random() * 4200
        : 4300 + Math.random() * 7600;

      timerRef.current = window.setTimeout(() => {
        if (cancelled) return;

        const effect = pickEffect();
        if (effect === "static") setStaticNonce((value) => value + 1);
        if (effect === "roll") setRollNonce((value) => value + 1);
        if (effect === "flicker") setFlickerNonce((value) => value + 1);

        schedule(false);
      }, delay);
    };

    schedule(true);

    return () => {
      cancelled = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [active]);

  if (!active) return null;

  return (
    <div className={styles.root} aria-hidden="true">
      {staticNonce ? <div key={`ambient-static-${staticNonce}`} className={styles.staticBurst} /> : null}
      {rollNonce ? <div key={`ambient-roll-${rollNonce}`} className={styles.roll} /> : null}
      {flickerNonce ? <div key={`ambient-flicker-${flickerNonce}`} className={styles.flicker} /> : null}
    </div>
  );
}
