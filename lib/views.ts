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
  const assessments = must(await db().from("assessments").select("*").in("listing_id", listings.map((l) => l.id))) as AssessmentRow[];
  const aBy = new Map(assessments.map((a) => [a.listing_id, a]));
  const views = listings.map((l) => ({ ...l, assessment: aBy.get(l.id) ?? null, submitter: (l as Listing & { submitted_by_name?: string | null }).submitted_by_name ?? null }));
  return ids ? ids.map((id) => views.find((v) => v.id === id)!).filter(Boolean) : views;
}

export const inr = (n: number | null | undefined) => (n == null ? "not confirmed" : "₹" + Math.round(n).toLocaleString("en-IN"));
export const STATUS_LABEL: Record<string, string> = {
  awaiting_preferences: "Waiting for everyone's constraints",
  pending: "Queued for next shortlist",
  assessed_unpublished: "Scored, publishes at 7:05pm",
  published: "Published",
};
