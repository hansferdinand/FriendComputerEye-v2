import { TextCopilotPanel } from "@/components/TextCopilotPanel";

export default async function CopilotPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return <TextCopilotPanel room={room} />;
}
