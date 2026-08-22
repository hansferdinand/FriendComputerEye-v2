import { ControlPanel } from "@/components/ControlPanel";
import { DeviceInvitePanel } from "@/components/DeviceInvitePanel";

export default async function ControlPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return (
    <>
      <ControlPanel room={room} />
      <DeviceInvitePanel room={room} />
    </>
  );
}
