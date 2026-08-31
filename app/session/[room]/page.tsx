import { SessionContextPanel } from "@/components/SessionContextPanel";
import { GmToolMenu } from "@/components/GmToolMenu";

export default async function SessionContextPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return (
    <>
      <SessionContextPanel room={room} />
      <GmToolMenu room={room} />
    </>
  );
}
