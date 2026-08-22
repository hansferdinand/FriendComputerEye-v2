import { DisplayWithQr } from "@/components/DisplayWithQr";

export default async function DisplayPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return <DisplayWithQr room={room} />;
}
