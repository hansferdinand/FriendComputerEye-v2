import { ShowReadinessPanel } from "@/components/ShowReadinessPanel";
import { GmToolMenu } from "@/components/GmToolMenu";

export default async function ShowReadinessPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return (
    <>
      <ShowReadinessPanel room={room} />
      <GmToolMenu room={room} />
    </>
  );
}
