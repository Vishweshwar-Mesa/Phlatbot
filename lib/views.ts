import "server-only";
import { db, must } from "./db";
import type { Listing, PersonAssessment } from "./types";

export interface AssessmentRow {
  listing_id: string;
  per_person: PersonAssessment[];
  overall_rank: string;
  qualify_count: number;
  soft_score: number | null;
  unconfirmed_count: number;
  narrative: string | null;
}
export type ListingView = Listing & { assessment: AssessmentRow | null; submitter: string | null };

/** Confirmed listings (never drafts) with their assessment and submitter name. */
export async function listingViews(ids?: string[]): Promise<ListingView[]> {
  let q = db().from("listings").select("*").neq("status", "draft").order("submitted_at", { ascending: false });
  if (ids) {
    if (!ids.length) return [];
    q = q.in("id", ids);
  }
  const listings = must(await q) as Listing[];
  if (!listings.length) return [];
  const [assessments, people] = await Promise.all([
    db().from("assessments").select("*").in("listing_id", listings.map((l) => l.id)),
    db().from("participants").select("name, telegram_user_id"),
  ]);
  const aBy = new Map((must(assessments) as AssessmentRow[]).map((a) => [a.listing_id, a]));
  const names = new Map((must(people) as { name: string; telegram_user_id: number | null }[]).map((p) => [p.telegram_user_id, p.name]));
  const views = listings.map((l) => ({ ...l, assessment: aBy.get(l.id) ?? null, submitter: names.get(l.submitted_by_telegram_id) ?? null }));
  return ids ? ids.map((id) => views.find((v) => v.id === id)!).filter(Boolean) : views;
}

export const inr = (n: number | null | undefined) => (n == null ? "not confirmed" : "₹" + Math.round(n).toLocaleString("en-IN"));
export const STATUS_LABEL: Record<string, string> = {
  awaiting_preferences: "Waiting for everyone's constraints",
  pending: "Queued for next shortlist",
  assessed_unpublished: "Scored, publishes at 7:05pm",
  published: "Published",
};
