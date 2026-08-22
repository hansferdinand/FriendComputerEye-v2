import { ControlPanel } from "@/components/ControlPanel";

export default async function ControlPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return <ControlPanel room={room} />;
}
