import { notFound } from "next/navigation";
import PageHeader from "@/app/components/PageHeader";
import { allParticipants, participantByToken } from "@/lib/participants";
import { listingViews, STATUS_LABEL } from "@/lib/views";
import ListingsClient, { type CardData } from "./ListingsClient";

export const dynamic = "force-dynamic";

export default async function ListingsPage({ params }: PageProps<"/p/[token]/listings">) {
  const { token } = await params;
  const me = await participantByToken(token);
  if (!me) notFound();
  const [views, people] = await Promise.all([listingViews(), allParticipants()]);

  const cards: CardData[] = views.map((v) => {
    const s = v.structured;
    return {
      id: v.id,
      locality: s.normalized_locality ?? s.location ?? "Locality not confirmed",
      rent: s.monthly_rent,
      deposit: s.security_deposit,
      bathrooms: s.bathrooms,
      bedrooms: s.bedrooms ?? null,
      lift: s.has_lift,
      parking: s.has_parking,
      furnishing: s.furnishing,
      floor: s.floor,
      notes: s.other_notes,
      lat: s.latitude ?? null,
      lng: s.longitude ?? null,
      submitter: v.submitter,
      status: STATUS_LABEL[v.status] ?? v.status,
      qualify: people.map((p) => {
        const a = v.assessment?.per_person.find((x) => x.participant_id === p.id);
        return { name: p.name, state: !a ? "x" : a.status === "disqualified" ? "n" : a.unconfirmed.length || a.flagged_ambiguous.length ? "u" : "y" };
      }),
      qualifyCount: v.assessment?.qualify_count ?? null,
    };
  });

  return (
    <>
      <PageHeader eyebrow="The pool" title="Listings" subtitle="Everything in the pool. Forward new ones to @Phlatbot." who={me.name} />
      <main className="container">
        <ListingsClient cards={cards} />
      </main>
    </>
  );
}
