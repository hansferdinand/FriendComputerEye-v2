import { SessionEventLogPanel } from "@/components/SessionEventLogPanel";

export default async function SessionLogPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return <SessionEventLogPanel room={room} />;
}
