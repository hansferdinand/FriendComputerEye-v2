import { TextCopilotPanel } from "@/components/TextCopilotPanel";
import { GmToolMenu } from "@/components/GmToolMenu";

export default async function CopilotPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return (
    <>
      <TextCopilotPanel room={room} />
      <GmToolMenu room={room} />
    </>
  );
}
