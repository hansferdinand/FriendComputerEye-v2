import { FriendComputerDisplay } from "@/components/FriendComputerDisplay";

export default async function DisplayPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return <FriendComputerDisplay room={room} />;
}
