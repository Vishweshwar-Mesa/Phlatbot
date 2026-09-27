import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Sidebar from "@/app/components/Sidebar";
import TabBar from "@/app/components/TabBar";
import { participantByToken } from "@/lib/participants";
import { batchVotes, isRevealed, latestPublishedBatch } from "@/lib/votes";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: LayoutProps<"/p/[token]">): Promise<Metadata> {
  const { token } = await params;
  return { manifest: `/p/${token}/manifest.webmanifest`, icons: { icon: "/icons/192", apple: "/icons/192" } };
}

// Each person's private app. The token in the URL is their only credential, so an
// unknown token is a plain 404 with no hint about which tokens exist.
export default async function PersonalAppLayout({ children, params }: LayoutProps<"/p/[token]">) {
  const { token } = await params;
  const me = await participantByToken(token);
  if (!me) notFound();

  // Badge: shortlisted flats on the latest page that still need this person's vote.
  const batch = await latestPublishedBatch();
  let toVote = 0;
  if (batch?.shortlist.length) {
    const votes = await batchVotes(batch.id);
    toVote = batch.shortlist.filter((id) => {
      const vs = votes.filter((v) => v.listing_id === id);
      return !isRevealed(batch, vs).revealed && !vs.some((v) => v.participant_id === me.id);
    }).length;
  }
  const homeAlerts = Number(!me.form_submitted_at) + Number(!me.telegram_user_id);

  return (
    <div className="shell">
      <Sidebar token={token} name={me.name} ready={!!me.form_submitted_at} counts={{ home: homeAlerts, shortlist: toVote }} />
      <div className="main-col">{children}</div>
      <TabBar token={token} alerts={{ home: homeAlerts > 0, shortlist: toVote > 0 }} />
    </div>
  );
}
