import { CommunicationsPanel } from "@/components/CommunicationsPanel";
import { GmToolMenu } from "@/components/GmToolMenu";

export default async function CommunicationsPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return (
    <>
      <CommunicationsPanel room={room} />
      <GmToolMenu room={room} />
    </>
  );
}
