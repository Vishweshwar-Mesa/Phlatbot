import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/app/components/PageHeader";
import { allParticipants } from "@/lib/participants";
import PinPad from "./PinPad";

export const dynamic = "force-dynamic";

export default async function PinPage({ params }: PageProps<"/pin/[name]">) {
  const { name } = await params;
  const me = (await allParticipants()).find((p) => p.name.toLowerCase() === decodeURIComponent(name).toLowerCase());
  if (!me) notFound();
  return (
    <div className="main-col" style={{ maxWidth: 420, margin: "0 auto" }}>
      <PageHeader eyebrow="Phlatmatch" title={`Hi ${me.name}`} subtitle="Enter your 4-digit PIN." />
      <main className="container">
        <PinPad name={me.name} />
        <p className="notice small" style={{ textAlign: "center", marginTop: 16 }}>
          PIN verification is in place, but for this trial any 4-digit PIN is accepted.
        </p>
        <p className="hint" style={{ textAlign: "center" }}><Link href="/?pick=1">Not {me.name}? Go back</Link></p>
      </main>
    </div>
  );
}
