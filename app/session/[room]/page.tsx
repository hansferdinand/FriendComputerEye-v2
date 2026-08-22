import { SessionContextPanel } from "@/components/SessionContextPanel";

export default async function SessionContextPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return <SessionContextPanel room={room} />;
}
