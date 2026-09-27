import "server-only";
import { db, must } from "./db";
import { AUTO_REVEAL_MS } from "./time";

export type Reaction = "interested" | "maybe" | "no";
export interface VoteRow {
  listing_id: string;
  batch_run_id: string;
  participant_id: string;
  reaction: Reaction;
  comment: string | null;
  updated_at: string;
}
export interface BatchRun {
  id: string;
  run_date: string;
  triggered_by: string;
  published_at: string | null;
  shortlist: string[];
  also_qualified: string[];
  empty_reason: string | null;
  listing_count: number;
}

/** All three at once, or the 24h auto-reveal. Nothing in between. */
export function isRevealed(batch: BatchRun, votesForListing: VoteRow[], now = Date.now()): { revealed: boolean; auto: boolean } {
  if (votesForListing.length >= 3) return { revealed: true, auto: false };
  const timedOut = !!batch.published_at && now - new Date(batch.published_at).getTime() >= AUTO_REVEAL_MS;
  return { revealed: timedOut, auto: timedOut };
}

export async function batchVotes(batchId: string): Promise<VoteRow[]> {
  return must(await db().from("votes").select("*").eq("batch_run_id", batchId)) as VoteRow[];
}

export async function latestPublishedBatch(): Promise<BatchRun | null> {
  const rows = must(
    await db().from("batch_runs").select("*").not("published_at", "is", null).order("published_at", { ascending: false }).limit(1),
  ) as BatchRun[];
  return rows[0] ?? null;
}

export async function batchById(id: string): Promise<BatchRun | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = must(await db().from("batch_runs").select("*").eq("id", id).limit(1)) as BatchRun[];
  return rows[0] ?? null;
}
