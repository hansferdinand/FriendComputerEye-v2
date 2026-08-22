"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export function JoinGmQr({ room, compact = false }: { room: string; compact?: boolean }) {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const controlUrl = useMemo(
    () => (origin ? `${origin}/control/${encodeURIComponent(room)}` : ""),
    [origin, room],
  );

  if (!controlUrl) return null;

  return (
    <div
      style={{
        display: "grid",
        gap: compact ? 10 : 14,
        justifyItems: "center",
        padding: compact ? 14 : 20,
        border: "1px solid #27646a",
        background: "#071214",
        color: "#dcfcff",
      }}
    >
      <div style={{ background: "white", padding: compact ? 10 : 14, lineHeight: 0 }}>
        <QRCodeSVG
          value={controlUrl}
          size={compact ? 190 : 250}
          level="M"
          bgColor="#ffffff"
          fgColor="#001416"
          marginSize={2}
        />
      </div>
      <strong style={{ letterSpacing: ".08em" }}>JOIN GM CONSOLE</strong>
      <small style={{ color: "#87b9bd", textAlign: "center", maxWidth: 420 }}>
        Scan with your phone. The room code is already included.
      </small>
    </div>
  );
}
