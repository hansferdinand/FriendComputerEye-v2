import { ControlPanel } from "@/components/ControlPanel";
import { DeviceInvitePanel } from "@/components/DeviceInvitePanel";
import { GmToolMenu } from "@/components/GmToolMenu";

export default async function ControlPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return (
    <>
      <ControlPanel room={room} />
      <DeviceInvitePanel room={room} />
      <GmToolMenu room={room} />
    </>
  );
}
