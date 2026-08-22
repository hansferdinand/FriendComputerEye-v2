import { MissionDirectorPanel } from "@/components/MissionDirectorPanel";

export default async function MissionDirectorPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return <MissionDirectorPanel room={room} />;
}
