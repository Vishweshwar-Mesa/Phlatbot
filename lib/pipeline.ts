import "server-only";
import { db, must } from "./db";
import { geocodeListings } from "./geocode";
import { assessListing, noGoKey, shortlist, type NoGoAnswers } from "./matching";
import { writeNarratives } from "./narrative";
import { allParticipants, allPreferences, readiness } from "./participants";
import { digestCutoff, istDate } from "./time";
import type { Listing, ListingVerdict, Preferences } from "./types";

// Orchestration around the pure matching engine: load inputs, persist assessments,
// publish batch runs. Status flow: awaiting_preferences -> pending -> assessed_unpublished -> published.

type Trigger = "cron" | "manual" | "onboarding_complete";

async function loadPeople() {
  const [ps, prefs] = await Promise.all([allParticipants(), allPreferences()]);
  const byId = new Map(prefs.map((p) => [p.participant_id, p] as [string, Preferences]));
  const people = ps.filter((p) => byId.has(p.id)).map((p) => ({ id: p.id, name: p.name, prefs: byId.get(p.id)! }));
  const rows = must(
    await db().from("no_go_confirmations").select("participant_id, normalized_locality, no_go_area, is_no_go"),
  ) as { participant_id: string; normalized_locality: string; no_go_area: string; is_no_go: boolean | null }[];
  const noGo = new Map<string, NoGoAnswers>();
  for (const r of rows) {
    if (!noGo.has(r.participant_id)) noGo.set(r.participant_id, new Map());
    noGo.get(r.participant_id)!.set(noGoKey(r.normalized_locality, r.no_go_area), r.is_no_go);
  }
  return { people, noGo };
}

/** Scores listings (cached extraction, no re-parse), writes one batched narrative, stores assessments. */
export async function assess(listings: Listing[]): Promise<ListingVerdict[]> {
  if (!listings.length) return [];
  const { people, noGo } = await loadPeople();
  if (people.length < 3) throw new Error("Readiness gate: not all three have submitted constraints");

  const verdicts = listings.map((l) => assessListing(l.id, l.structured, people, noGo));
  const narratives = await writeNarratives(
    verdicts.filter((v) => v.qualify_count > 0).map((v) => ({ verdict: v, structured: listings.find((l) => l.id === v.listing_id)!.structured })),
  );

  must(
    await db()
      .from("assessments")
      .upsert(
        verdicts.map((v) => ({
          listing_id: v.listing_id,
          per_person: v.per_person,
          overall_rank: v.overall_rank,
          qualify_count: v.qualify_count,
          soft_score: v.soft_score,
          unconfirmed_count: v.unconfirmed_count,
          narrative: narratives.get(v.listing_id) ?? null,
          created_at: new Date().toISOString(),
        })),
        { onConflict: "listing_id" },
      )
      .select("id"),
  );

  // Ambiguous no-go matches become questions for that person (asked in the app, never decided for them).
  const flags = verdicts.flatMap((v) =>
    v.per_person.flatMap((p) =>
      p.flagged_ambiguous.map((f) => ({ participant_id: p.participant_id, normalized_locality: f.normalized_locality, no_go_area: f.no_go_area })),
    ),
  );
  if (flags.length) {
    must(
      await db()
        .from("no_go_confirmations")
        .upsert(flags, { onConflict: "participant_id,normalized_locality,no_go_area", ignoreDuplicates: true })
        .select("participant_id"),
    );
  }

  await geocodeListings(listings); // map pins; failures leave the listing without one

  must(
    await db()
      .from("listings")
      .update({ status: "assessed_unpublished" })
      .in("id", listings.filter((l) => l.status !== "published").map((l) => l.id))
      .select("id"),
  );
  return verdicts;
}

async function listingsWithStatus(statuses: string[]): Promise<Listing[]> {
  return must(await db().from("listings").select("*").in("status", statuses).order("submitted_at")) as Listing[];
}

async function logRun(trigger: Trigger, extra: Record<string, unknown>) {
  return must(
    await db()
      .from("batch_runs")
      .insert({ run_date: istDate(), triggered_by: trigger, completed_at: new Date().toISOString(), ...extra })
      .select()
      .single(),
  ) as { id: string };
}

/** Called after a form save (see /api/form/[token]). */
export async function onPreferencesSaved(_participantId: string, firstSubmission: boolean): Promise<void> {
  const { ready } = await readiness();
  if (!ready) return;
  if (firstSubmission) {
    // The pool just became complete: assess everything that was waiting, but don't publish yet.
    const waiting = await listingsWithStatus(["awaiting_preferences"]);
    if (waiting.length) {
      must(await db().from("listings").update({ status: "pending" }).in("id", waiting.map((l) => l.id)).select("id"));
      await assess(waiting.map((l) => ({ ...l, status: "pending" })));
    }
    await logRun("onboarding_complete", { listing_count: waiting.length });
    return;
  }
  // An edit after readiness: never publish results based on old constraints.
  const stale = await listingsWithStatus(["assessed_unpublished"]);
  if (stale.length) await assess(stale);
}

/**
 * Publishes a shortlist page (a batch run with published_at).
 * cron:   assesses pending listings submitted before today's 6pm IST cutoff, then publishes all assessed_unpublished.
 * manual: (/reassess, rate-limited) re-scores everything pending or assessed_unpublished, then publishes.
 */
export async function publish(trigger: "cron" | "manual"): Promise<{ batchRunId: string; count: number; emptyReason: string | null }> {
  const { ready, waiting } = await readiness();
  if (!ready) {
    const reason = `No shortlist yet: waiting on ${waiting.map((w) => w.name).join(", ")} to fill in their constraints.`;
    const run = await logRun(trigger, { published_at: new Date().toISOString(), empty_reason: reason });
    return { batchRunId: run.id, count: 0, emptyReason: reason };
  }

  if (trigger === "cron") {
    const cutoff = digestCutoff();
    const pending = (await listingsWithStatus(["pending"])).filter((l) => new Date(l.submitted_at) < cutoff);
    await assess(pending);
  } else {
    await assess(await listingsWithStatus(["pending", "assessed_unpublished"]));
  }

  const ready_ = await listingsWithStatus(["assessed_unpublished"]);
  const assessments = ready_.length
    ? (must(await db().from("assessments").select("*").in("listing_id", ready_.map((l) => l.id))) as (ListingVerdict & { listing_id: string })[])
    : [];
  const { top, also } = shortlist(assessments);
  const emptyReason = !ready_.length
    ? "No new listings today."
    : !top.length
      ? "No listings met everyone's minimums today."
      : null;

  const run = await logRun(trigger, {
    published_at: new Date().toISOString(),
    listing_count: ready_.length,
    shortlist: top.map((v) => v.listing_id),
    also_qualified: also.map((v) => v.listing_id),
    empty_reason: emptyReason,
  });
  if (ready_.length) {
    must(
      await db()
        .from("listings")
        .update({ status: "published", published_batch_run_id: run.id })
        .in("id", ready_.map((l) => l.id))
        .select("id"),
    );
  }
  return { batchRunId: run.id, count: top.length, emptyReason };
}

/** /reassess equivalent (button in the app): once per hour in total. */
export async function reassessNow(): Promise<{ ok: true; batchRunId: string } | { ok: false; retryAt: string }> {
  const { data, error } = await db().rpc("try_rate_limit", { p_key: "reassess", p_seconds: 3600 });
  if (error) throw new Error(error.message);
  if (data) return { ok: false, retryAt: data as string };
  const r = await publish("manual");
  return { ok: true, batchRunId: r.batchRunId };
}
