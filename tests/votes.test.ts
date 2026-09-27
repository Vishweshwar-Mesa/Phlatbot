import { describe, expect, it } from "vitest";
import { isRevealed, type BatchRun, type VoteRow } from "@/lib/votes";

const batch = (publishedHoursAgo: number): BatchRun => ({
  id: "b", run_date: "2026-09-27", triggered_by: "cron", shortlist: ["l"], also_qualified: [], empty_reason: null,
  listing_count: 1, published_at: new Date(Date.now() - publishedHoursAgo * 3600e3).toISOString(),
});
const v = (p: string): VoteRow => ({ listing_id: "l", batch_run_id: "b", participant_id: p, reaction: "maybe", comment: null, updated_at: "" });

describe("vote reveal", () => {
  it("stays sealed with 2 of 3 votes inside 24h", () => expect(isRevealed(batch(2), [v("r"), v("m")]).revealed).toBe(false));
  it("reveals when all three have voted", () => expect(isRevealed(batch(2), [v("r"), v("m"), v("k")])).toEqual({ revealed: true, auto: false }));
  it("auto-reveals whatever exists after 24h", () => expect(isRevealed(batch(25), [v("r")])).toEqual({ revealed: true, auto: true }));
});
