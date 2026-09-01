import { GmHandoffPanel } from "@/components/GmHandoffPanel";
import { GmToolMenu } from "@/components/GmToolMenu";

export default async function GmHandoffPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return (
    <>
      <GmHandoffPanel room={room} />
      <GmToolMenu room={room} />
    </>
  );
}
