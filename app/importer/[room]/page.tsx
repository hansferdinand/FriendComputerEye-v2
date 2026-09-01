import { GmToolMenu } from "@/components/GmToolMenu";
import { StoryImporterPanel } from "@/components/StoryImporterPanel";

export default async function StoryImporterPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return (
    <>
      <StoryImporterPanel room={room} />
      <GmToolMenu room={room} />
    </>
  );
}
