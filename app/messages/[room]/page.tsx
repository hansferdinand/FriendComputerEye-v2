import { GmToolMenu } from "@/components/GmToolMenu";
import { PrivateMessagingPanel } from "@/components/PrivateMessagingPanel";

export default async function PrivateMessagingPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return (
    <>
      <PrivateMessagingPanel room={room} />
      <GmToolMenu room={room} />
    </>
  );
}
