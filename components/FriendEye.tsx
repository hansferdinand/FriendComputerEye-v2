"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Expression } from "@/lib/friend-computer";

type Props = {
  gazeX: number;
  gazeY: number;
  expression: Expression;
  intensity: number;
  blinkNonce: number;
  doubleBlinkNonce: number;
  visible: boolean;
  danger: boolean;
};

type LidGeometry = {
  topLeft: number;
  topRight: number;
  topCenter: number;
  bottomLeft: number;
  bottomRight: number;
  bottomCenter: number;
};

type LidShape = {
  top: string;
  bottom: string;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

function getLidGeometry(expression: Expression, intensity: number): LidGeometry {
  const i = clamp01(intensity);

  switch (expression) {
    case "happy":
      return {
        topLeft: 350,
        topRight: 350,
        topCenter: 140 + i * 15,
        bottomLeft: 350,
        bottomRight: 350,
        bottomCenter: 560 - i * 20,
      };
    case "suspicious":
      return {
        topLeft: 350,
        topRight: 350,
        topCenter: 145 + i * 40,
        bottomLeft: 350,
        bottomRight: 350,
        bottomCenter: 555 - i * 40,
      };
    case "angry":
      return {
        topLeft: 382,
        topRight: 318,
        topCenter: 170 + i * 25,
        bottomLeft: 350,
        bottomRight: 350,
        bottomCenter: 540 - i * 20,
      };
    case "terrified":
      return {
        topLeft: 350,
        topRight: 350,
        topCenter: 115,
        bottomLeft: 350,
        bottomRight: 350,
        bottomCenter: 585,
      };
    case "drugged":
      return {
        topLeft: 350,
        topRight: 350,
        topCenter: 220,
        bottomLeft: 350,
        bottomRight: 350,
        bottomCenter: 485,
      };
    default:
      return {
        topLeft: 350,
        topRight: 350,
        topCenter: 125,
        bottomLeft: 350,
        bottomRight: 350,
        bottomCenter: 575,
      };
  }
}

function getLids(expression: Expression, intensity: number, blinkAmount: number): LidShape {
  const base = getLidGeometry(expression, intensity);
  const b = clamp01(blinkAmount);

  const topLeft = lerp(base.topLeft, 350, b);
  const topRight = lerp(base.topRight, 350, b);
  const topCenter = lerp(base.topCenter, 350, b);
  const bottomLeft = lerp(base.bottomLeft, 350, b);
  const bottomRight = lerp(base.bottomRight, 350, b);
  const bottomCenter = lerp(base.bottomCenter, 350, b);

  // The geometry values above describe the visible midpoint of each lid.
  // Convert that midpoint into the quadratic Bezier control point so the
  // rendered curve actually passes through the intended center position.
  const topControl = 2 * topCenter - (topLeft + topRight) / 2;
  const bottomControl = 2 * bottomCenter - (bottomLeft + bottomRight) / 2;

  return {
    top: `M130 50 H870 V${topRight} Q500 ${topControl} 130 ${topLeft} Z`,
    bottom: `M130 ${bottomLeft} Q500 ${bottomControl} 870 ${bottomRight} V650 H130 Z`,
  };
}

function easeInOutSine(value: number) {
  return -(Math.cos(Math.PI * clamp01(value)) - 1) / 2;
}

function blinkAmountAt(elapsed: number, count: number) {
  const closeMs = 62;
  const openMs = 92;
  const pauseMs = 105;
  const cycleMs = closeMs + openMs + pauseMs;
  const totalMs = count === 2 ? cycleMs + closeMs + openMs : closeMs + openMs;

  if (elapsed >= totalMs) return { amount: 0, done: true };

  const cycle = count === 2 && elapsed >= cycleMs ? elapsed - cycleMs : elapsed;
  if (cycle < closeMs) {
    return { amount: easeInOutSine(cycle / closeMs), done: false };
  }
  if (cycle < closeMs + openMs) {
    return {
      amount: 1 - easeInOutSine((cycle - closeMs) / openMs),
      done: false,
    };
  }
  return { amount: 0, done: false };
}

export function FriendEye({
  gazeX,
  gazeY,
  expression,
  intensity,
  blinkNonce,
  doubleBlinkNonce,
  visible,
  danger,
}: Props) {
  const [micro, setMicro] = useState({ x: 0, y: 0 });
  const [pupilBreath, setPupilBreath] = useState(1);
  const [blinkAmount, setBlinkAmount] = useState(0);
  const previousDoubleBlink = useRef(doubleBlinkNonce);
  const lids = useMemo(
    () => getLids(expression, intensity, blinkAmount),
    [expression, intensity, blinkAmount],
  );

  useEffect(() => {
    let timer = window.setTimeout(function tick() {
      setMicro({
        x: (Math.random() - 0.5) * 5,
        y: (Math.random() - 0.5) * 3,
      });
      timer = window.setTimeout(tick, 850 + Math.random() * 2100);
    }, 900);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (expression === "terrified" || expression === "drugged") return;
      setPupilBreath(0.94 + Math.random() * 0.12);
    }, 2400);
    return () => window.clearInterval(timer);
  }, [expression]);

  useEffect(() => {
    if (!blinkNonce && !doubleBlinkNonce) return;

    const isDouble = doubleBlinkNonce !== previousDoubleBlink.current;
    previousDoubleBlink.current = doubleBlinkNonce;
    const count = isDouble ? 2 : 1;
    const startedAt = performance.now();
    let frameId = 0;

    const animate = (now: number) => {
      const frame = blinkAmountAt(now - startedAt, count);
      setBlinkAmount(frame.amount);
      if (!frame.done) frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(frameId);
      setBlinkAmount(0);
    };
  }, [blinkNonce, doubleBlinkNonce]);

  const irisX = 500 + gazeX * 155 + micro.x;
  const irisY = 350 + gazeY * 92 + micro.y;
  const irisCompression = 1 - Math.min(Math.abs(gazeX) * 0.13, 0.13);
  const expressionPupil = expression === "terrified" ? 0.58 : expression === "drugged" ? 1.46 : 1;
  const pupilScale = expressionPupil * pupilBreath;
  const dangerOpacity = danger ? 1 : 0;

  return (
    <div
      className={`eye-stage ${visible ? "eye-stage--visible" : "eye-stage--hidden"}`}
      aria-label="Friend Computer eye"
    >
      <svg viewBox="0 0 1000 700" role="img" aria-hidden="true">
        <defs>
          <clipPath id="eye-clip">
            <ellipse cx="500" cy="350" rx="352" ry="238" />
          </clipPath>
          <radialGradient id="sclera" cx="48%" cy="43%" r="64%">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="68%" stopColor="#d7e5e8" />
            <stop offset="100%" stopColor="#708489" />
          </radialGradient>
          <radialGradient id="iris-blue" cx="42%" cy="38%" r="65%">
            <stop offset="0%" stopColor="#9ce8ff" />
            <stop offset="42%" stopColor="#2d9eea" />
            <stop offset="80%" stopColor="#07518c" />
            <stop offset="100%" stopColor="#001a35" />
          </radialGradient>
          <radialGradient id="iris-red" cx="42%" cy="38%" r="65%">
            <stop offset="0%" stopColor="#ff745f" />
            <stop offset="45%" stopColor="#df2018" />
            <stop offset="82%" stopColor="#6f0503" />
            <stop offset="100%" stopColor="#240000" />
          </radialGradient>
          <filter id="eye-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="14" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g clipPath="url(#eye-clip)">
          <ellipse cx="500" cy="350" rx="352" ry="238" fill="url(#sclera)" />
          <g
            className="iris-rig"
            style={{
              transform: `translate(${irisX - 500}px, ${irisY - 350}px) scaleX(${irisCompression})`,
            }}
          >
            <circle cx="500" cy="350" r="150" fill="#003e68" opacity="0.48" filter="url(#eye-glow)" />
            <circle
              cx="500"
              cy="350"
              r="150"
              fill="#310000"
              filter="url(#eye-glow)"
              style={{ opacity: dangerOpacity * 0.48, transition: "opacity 320ms ease" }}
            />
            <circle cx="500" cy="350" r="136" fill="url(#iris-blue)" stroke="#62cfff" strokeWidth="5" />
            <circle
              cx="500"
              cy="350"
              r="136"
              fill="url(#iris-red)"
              stroke="#ff4d35"
              strokeWidth="5"
              style={{ opacity: dangerOpacity, transition: "opacity 320ms ease" }}
            />
            <circle cx="500" cy="350" r={56 * pupilScale} fill="#020000" className="pupil" />
            <ellipse cx="456" cy="302" rx="27" ry="16" fill="white" opacity="0.9" />
            <ellipse cx="478" cy="322" rx="10" ry="7" fill="white" opacity="0.55" />
          </g>
          <path className="eyelid eyelid--top" d={lids.top} style={{ transition: "none" }} />
          <path className="eyelid eyelid--bottom" d={lids.bottom} style={{ transition: "none" }} />
        </g>
        <ellipse cx="500" cy="350" rx="354" ry="240" fill="none" stroke="#101b1c" strokeWidth="26" opacity="0.88" />
      </svg>
    </div>
  );
}
