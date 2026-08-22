import { ShowReadinessPanel } from "@/components/ShowReadinessPanel";

export default async function ShowReadinessPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return <ShowReadinessPanel room={room} />;
}
