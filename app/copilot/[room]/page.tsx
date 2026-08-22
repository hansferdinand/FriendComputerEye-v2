import Link from "next/link";
import { AICopilotDock } from "@/components/AICopilotDock";

export default async function CopilotPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return (
    <>
      <div className="control-shell" style={{ minHeight: 0, paddingBottom: 0 }}>
        <div className="control-header-actions" style={{ justifyContent: "flex-start" }}>
          <Link className="display-link" href={`/control/${encodeURIComponent(room)}`}>
            ← MANUAL GM CONSOLE
          </Link>
          <Link className="display-link" href={`/display/${encodeURIComponent(room)}`} target="_blank">
            OPEN DISPLAY ↗
          </Link>
        </div>
      </div>
      <AICopilotDock room={room} />
    </>
  );
}
