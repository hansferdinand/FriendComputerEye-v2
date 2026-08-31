import { MissionDirectorPanel } from "@/components/MissionDirectorPanel";
import { GmToolMenu } from "@/components/GmToolMenu";

export default async function MissionDirectorPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return (
    <>
      <MissionDirectorPanel room={room} />
      <GmToolMenu room={room} />
    </>
  );
}
