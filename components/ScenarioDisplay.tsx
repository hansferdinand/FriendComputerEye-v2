"use client";

import { useEffect, useMemo, useState } from "react";
import { SATIATE_FINAL_STAGES, SATIATE_OUTCOMES } from "@/lib/scenarios";
import { formatScenarioTime, scenarioRemainingMs, type ScenarioRuntimeSnapshot } from "@/lib/scenario-runtime";

export function ScenarioDisplay({ snapshot }: { snapshot: ScenarioRuntimeSnapshot }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);

  const remainingMs = scenarioRemainingMs(snapshot, now);
  const inferredZeroAt = snapshot.running && snapshot.endsAt !== null && snapshot.endsAt <= now ? snapshot.endsAt : null;
  const zeroAt = snapshot.zeroTriggeredAt ?? inferredZeroAt;
  const inTransition = zeroAt !== null && now - zeroAt < 1200;
  const revealing = zeroAt !== null && !inTransition;
  const outcome = SATIATE_OUTCOMES[snapshot.outcome];
  const finalStage = useMemo(() => {
    if (!snapshot.finalSequenceEnabled) return null;
    return [...SATIATE_FINAL_STAGES].reverse().find((stage) => remainingMs <= stage.atMs) ?? null;
  }, [remainingMs, snapshot.finalSequenceEnabled]);
  const finalMinute = remainingMs <= 60_000 && zeroAt === null;
  const finalTen = remainingMs <= 10_000 && zeroAt === null;

  if (inTransition) return <div className="scenario-blackout" aria-label="SATIATE-7 zero-event transition" />;

  if (revealing) {
    return (
      <div className={`scenario-reveal scenario-reveal--${snapshot.outcome}`}>
        <div className="scenario-reveal-seal">SATIATE-7</div>
        <h2>{outcome.headline}</h2>
        <p>{outcome.detail}</p>
      </div>
    );
  }

  return (
    <div className={`scenario-hud scenario-hud--${snapshot.presentation.kind} ${finalMinute ? "scenario-hud--final-minute" : ""} ${finalTen ? "scenario-hud--final-ten" : ""}`}>
      <div className="scenario-ident">
        <span>{snapshot.presentation.eyebrow}</span>
        <strong>{snapshot.presentation.headline}</strong>
        <small>{snapshot.presentation.detail}</small>
      </div>
      <div className="scenario-clock" aria-label={`SATIATE-7 countdown ${formatScenarioTime(remainingMs)}`}>
        {formatScenarioTime(remainingMs)}
      </div>
      <div className="scenario-stage">
        {finalStage ? <><span>PRE-SERVICE SEQUENCE</span><strong>{finalStage.label}</strong></> : <><span>SAT-7 COUNTDOWN</span><strong>{snapshot.running ? "COUNTDOWN ACTIVE" : "COUNTDOWN HOLD"}</strong></>}
      </div>
    </div>
  );
}
