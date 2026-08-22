import { CommunicationsPanel } from "@/components/CommunicationsPanel";

export default async function CommunicationsPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return <CommunicationsPanel room={room} />;
}
