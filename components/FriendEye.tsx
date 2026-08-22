"use client";

import { useEffect, useMemo, useState } from "react";
import type { Expression } from "@/lib/friend-computer";

type Props = {
  gazeX: number;
  gazeY: number;
  expression: Expression;
  intensity: number;
  blinkNonce: number;
  doubleBlinkNonce: number;
  visible: boolean;
};

type LidShape = {
  top: string;
  bottom: string;
};

function getLids(expression: Expression, intensity: number): LidShape {
  const i = Math.max(0, Math.min(1, intensity));
  switch (expression) {
    case "happy":
      return {
        top: `M130 50 H870 V350 Q500 ${205 + i * 20} 130 350 Z`,
        bottom: `M130 350 Q500 ${515 - i * 25} 870 350 V650 H130 Z`,
      };
    case "suspicious":
      return {
        top: `M130 50 H870 V350 Q500 ${255 + i * 38} 130 350 Z`,
        bottom: `M130 350 Q500 ${455 - i * 30} 870 350 V650 H130 Z`,
      };
    case "angry":
      return {
        top: `M130 50 H870 V300 Q505 ${235 + i * 25} 130 365 Z`,
        bottom: `M130 350 Q500 ${505 - i * 18} 870 350 V650 H130 Z`,
      };
    case "terrified":
      return {
        top: "M130 50 H870 V350 Q500 155 130 350 Z",
        bottom: "M130 350 Q500 550 870 350 V650 H130 Z",
      };
    case "drugged":
      return {
        top: "M130 50 H870 V350 Q500 275 130 350 Z",
        bottom: "M130 350 Q500 490 870 350 V650 H130 Z",
      };
    default:
      return {
        top: "M130 50 H870 V350 Q500 205 130 350 Z",
        bottom: "M130 350 Q500 515 870 350 V650 H130 Z",
      };
  }
}

export function FriendEye({
  gazeX,
  gazeY,
  expression,
  intensity,
  blinkNonce,
  doubleBlinkNonce,
  visible,
}: Props) {
  const [micro, setMicro] = useState({ x: 0, y: 0 });
  const [pupilBreath, setPupilBreath] = useState(1);
  const lids = useMemo(() => getLids(expression, intensity), [expression, intensity]);

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

  const irisX = 500 + gazeX * 155 + micro.x;
  const irisY = 350 + gazeY * 92 + micro.y;
  const irisCompression = 1 - Math.min(Math.abs(gazeX) * 0.13, 0.13);
  const expressionPupil = expression === "terrified" ? 0.58 : expression === "drugged" ? 1.46 : 1;
  const pupilScale = expressionPupil * pupilBreath;

  return (
    <div
      className={`eye-stage ${visible ? "eye-stage--visible" : "eye-stage--hidden"}`}
      aria-label="Friend Computer eye"
    >
      <svg viewBox="0 0 1000 700" role="img" aria-hidden="true">
        <defs>
          <clipPath id="eye-clip">
            <ellipse cx="500" cy="350" rx="335" ry="225" />
          </clipPath>
          <radialGradient id="sclera" cx="48%" cy="43%" r="64%">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="68%" stopColor="#d7e5e8" />
            <stop offset="100%" stopColor="#708489" />
          </radialGradient>
          <radialGradient id="iris" cx="42%" cy="38%" r="65%">
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
          <ellipse cx="500" cy="350" rx="335" ry="225" fill="url(#sclera)" />
          <g
            className="iris-rig"
            style={{
              transform: `translate(${irisX - 500}px, ${irisY - 350}px) scaleX(${irisCompression})`,
            }}
          >
            <circle cx="500" cy="350" r="137" fill="#310000" opacity="0.45" filter="url(#eye-glow)" />
            <circle cx="500" cy="350" r="124" fill="url(#iris)" stroke="#ff4d35" strokeWidth="5" />
            <circle
              cx="500"
              cy="350"
              r={54 * pupilScale}
              fill="#020000"
              className="pupil"
            />
            <ellipse cx="460" cy="306" rx="25" ry="15" fill="white" opacity="0.9" />
            <ellipse cx="480" cy="324" rx="9" ry="6" fill="white" opacity="0.55" />
          </g>
          <path className="eyelid eyelid--top" d={lids.top} />
          <path className="eyelid eyelid--bottom" d={lids.bottom} />
        </g>
        <ellipse cx="500" cy="350" rx="337" ry="227" fill="none" stroke="#101b1c" strokeWidth="26" opacity="0.88" />
      </svg>
      <div key={`blink-${blinkNonce}`} className={blinkNonce ? "blink blink--single" : "blink"} />
      <div key={`double-${doubleBlinkNonce}`} className={doubleBlinkNonce ? "blink blink--double" : "blink"} />
    </div>
  );
}
