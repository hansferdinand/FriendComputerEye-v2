import { GmToolMenu } from "@/components/GmToolMenu";
import { RehearsalPanel } from "@/components/RehearsalPanel";

export default async function RehearsalPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return (
    <>
      <RehearsalPanel room={room} />
      <GmToolMenu room={room} />
    </>
  );
}
