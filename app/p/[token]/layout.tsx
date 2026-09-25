import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TabBar from "@/app/components/TabBar";
import { participantByToken } from "@/lib/participants";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: LayoutProps<"/p/[token]">): Promise<Metadata> {
  const { token } = await params;
  return {
    manifest: `/p/${token}/manifest.webmanifest`,
    icons: { icon: "/icons/192", apple: "/icons/192" },
  };
}

// Each person's private app. The token in the URL is their only credential, so an
// unknown token is a plain 404 with no hint about which tokens exist.
export default async function PersonalAppLayout({ children, params }: LayoutProps<"/p/[token]">) {
  const { token } = await params;
  const me = await participantByToken(token);
  if (!me) notFound();

  return (
    <>
      {children}
      <TabBar token={token} alerts={{ home: !me.form_submitted_at || !me.telegram_user_id }} />
    </>
  );
}
