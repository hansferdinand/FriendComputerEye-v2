import { GmToolMenu } from "@/components/GmToolMenu";
import { MissionWorkshopPanel } from "@/components/MissionWorkshopPanel";

export default async function MissionWorkshopPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return (
    <>
      <MissionWorkshopPanel room={room} />
      <GmToolMenu room={room} />
    </>
  );
}
