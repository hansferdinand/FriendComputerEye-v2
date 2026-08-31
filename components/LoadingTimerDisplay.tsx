"use client";

import { useEffect, useState } from "react";
import {
  formatLoadingRemaining,
  loadingTimerProgress,
  type LoadingTimerState,
} from "@/lib/loading-timer";

export function LoadingTimerDisplay({ timer }: { timer: LoadingTimerState }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [timer.startedAt]);

  const progress = loadingTimerProgress(timer, now);
  const progressPercent = Math.round(progress * 1000) / 10;
  const complete = progress >= 1;

  return (
    <section className={`loading-timer ${complete ? "loading-timer--complete" : ""}`} aria-label={timer.label}>
      <div className="loading-timer-heading">
        <span>{timer.label}</span>
        <strong>{formatLoadingRemaining(timer, now)}</strong>
      </div>
      <div
        className="loading-timer-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPercent}
        aria-valuetext={formatLoadingRemaining(timer, now)}
      >
        <i style={{ width: `${progressPercent}%` }} />
      </div>
      <div className="loading-timer-scale" aria-hidden="true">
        <span>REQUEST RECEIVED</span>
        <span>{progressPercent.toFixed(1)}%</span>
        <span>{complete ? "COMPLETE" : "PROCESSING"}</span>
      </div>
    </section>
  );
}
