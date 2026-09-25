import { notFound } from "next/navigation";
import { approvalFor } from "@/lib/approval";
import { db, must } from "@/lib/db";
import { participantByToken } from "@/lib/participants";
import type { Preferences } from "@/lib/types";
import FormClient, { type InitialForm } from "./FormClient";

export const dynamic = "force-dynamic";

export default async function FormPage({ params }: PageProps<"/form/[token]">) {
  const { token } = await params;
  const me = await participantByToken(token);
  if (!me) notFound();

  const rows = must(
    await db().from("preferences").select("*").eq("participant_id", me.id).limit(1),
  ) as Preferences[];
  const saved = rows[0] ?? null;

  const initial: InitialForm | null = saved && {
    max_rent: saved.max_rent,
    min_bathrooms: saved.min_bathrooms,
    no_go_areas: saved.no_go_areas,
    requires_lift: saved.requires_lift,
    requires_parking: saved.requires_parking,
    requires_pet_friendly: saved.requires_pet_friendly,
    requires_bachelor_friendly: saved.requires_bachelor_friendly,
    starter_weights: Object.fromEntries(
      saved.soft_preferences.filter((s) => !s.is_custom).map((s) => [s.label, s.weight]),
    ),
    // Already-accepted custom factors carry a fresh approval so re-saving doesn't re-check them.
    custom: saved.soft_preferences
      .filter((s) => s.is_custom)
      .map((s) => ({ label: s.label, weight: s.weight, approval: approvalFor(me.id, s.label) })),
  };

  return (
    <main className="container">
      <h1>Hi {me.name}, your flat constraints</h1>
      <p className="muted">
        Fill this in on your own. The others can&apos;t see your answers here. Hard minimums are strict pass/fail
        checks. Preferences are weighted by how much each one matters to you. You can come back and edit this any
        time using the same link.
      </p>
      {me.form_submitted_at && (
        <p className="success small">You&apos;ve already submitted. Saving again updates your answers.</p>
      )}
      <FormClient token={token} initial={initial} />
    </main>
  );
}
