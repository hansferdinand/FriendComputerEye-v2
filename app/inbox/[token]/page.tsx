import type { Metadata } from "next";
import { PlayerInboxPanel } from "@/components/PlayerInboxPanel";

export const metadata: Metadata = {
  title: "Private Citizen Inbox · Friend Computer",
  description: "A private Friend Computer messaging channel.",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
};

export default async function PlayerInboxPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PlayerInboxPanel token={token} />;
}
