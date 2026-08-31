import { SessionEventLogPanel } from "@/components/SessionEventLogPanel";
import { GmToolMenu } from "@/components/GmToolMenu";

export default async function SessionLogPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return (
    <>
      <SessionEventLogPanel room={room} />
      <GmToolMenu room={room} />
    </>
  );
}
