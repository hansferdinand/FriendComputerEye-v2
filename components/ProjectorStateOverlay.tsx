"use client";

import { useEffect, useState } from "react";
import type { ProjectorState } from "@/lib/friend-computer";

function lookupEstimate(elapsedMs: number) {
  const cycle = Math.floor(elapsedMs / 4200);
  const years = 17 + (cycle % 34);
  const months = (8 + cycle * 7) % 12;
  const days = (14 + cycle * 13) % 31;
  return `${years} YEARS · ${months} MONTHS · ${days} DAYS`;
}

export function ProjectorStateOverlay({ state }: { state: ProjectorState }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (state.kind !== "records-lookup") return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [state.kind]);

  if (state.kind === "clearance-denied") {
    return (
      <div className="projector-state projector-state--clearance">
        <span>ALPHA COMPLEX INFORMATION CONTROL</span>
        <h2>THAT INFORMATION ISN&apos;T AVAILABLE AT YOUR CLEARANCE LEVEL</h2>
        <p>YOUR REQUEST HAS BEEN RECORDED FOR QUALITY AND LOYALTY ASSURANCE</p>
      </div>
    );
  }

  const elapsedMs = Math.max(0, now - state.startedAt);
  const progress = Math.min(0.999, 0.0007 + (elapsedMs % 120_000) / 120_000 * 0.008);

  return (
    <div className="projector-state projector-state--lookup">
      <span>FRIEND COMPUTER ARCHIVAL SERVICES</span>
      <h2>PLEASE WAIT WHILE I LOOK THAT UP</h2>
      <div className="projector-lookup-estimate">
        <small>ESTIMATED COMPLETION</small>
        <strong>{lookupEstimate(elapsedMs)}</strong>
      </div>
      <div className="projector-progress" aria-label={`Archive lookup ${(progress * 100).toFixed(3)} percent complete`}>
        <i style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="projector-progress-scale"><span>NOW</span><span>5 YEARS</span><span>10 YEARS</span><span>25 YEARS</span><span>50 YEARS</span></div>
      <p>SEARCH ${(progress * 100).toFixed(3)}% COMPLETE · PLEASE DO NOT INTERRUPT FRIEND COMPUTER</p>
    </div>
  );
}
