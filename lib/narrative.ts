import "server-only";
import { generateJson } from "./gemini";
import type { ListingStructured, ListingVerdict } from "./types";

// Gemini job 2: turn verdicts the code already computed into a short "who gets what / who
// compromises" narrative. One batched call per assessment run. It receives only structured
// facts (never raw listing text) and is told not to change or add to them.

export async function writeNarratives(
  items: { verdict: ListingVerdict; structured: ListingStructured }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!items.length) return out;

  const facts = items.map(({ verdict: v, structured: s }) => ({
    listing_id: v.listing_id,
    locality: s.normalized_locality,
    monthly_rent: s.monthly_rent,
    qualifies_for: v.overall_rank,
    people: v.per_person.map((p) => ({
      name: p.name,
      hard_constraints: p.status,
      disqualified_because: p.reasons,
      not_confirmed: p.unconfirmed,
      needs_their_confirmation: p.flagged_ambiguous.map((f) => `is ${f.normalized_locality} inside no-go "${f.no_go_area}"?`),
      weighted_preference_score_percent: p.soft_score === null ? null : Math.round(p.soft_score * 100),
      preferences: p.soft_match_notes.map((n) => ({ label: n.label, weight_1_to_5: n.weight, result: n.outcome })),
    })),
  }));

  const prompt = [
    "You write short, neutral summaries for three flatmates comparing rental flats.",
    "For EACH listing below, write 2-3 plain sentences on who gets what they weighted and who compromises.",
    "Hard rules:",
    "- Use only the facts given. Do not alter, soften or add to any pass/fail result, reason, or score.",
    "- Do not recommend a flat, rank them, or say which is best. Never pick a winner.",
    "- 'no_data' means the listing doesn't mention it; say 'not mentioned', never treat it as a yes or a no.",
    "- Mention anything not confirmed or awaiting a person's confirmation.",
    "",
    JSON.stringify(facts),
  ].join("\n");

  try {
    const res = await generateJson<{ narratives: { listing_id: string; text: string }[] }>(
      prompt,
      {
        type: "object",
        properties: {
          narratives: {
            type: "array",
            items: {
              type: "object",
              properties: { listing_id: { type: "string" }, text: { type: "string" } },
              required: ["listing_id", "text"],
            },
          },
        },
        required: ["narratives"],
      },
      0.3,
    );
    const ids = new Set(items.map((i) => i.verdict.listing_id));
    for (const n of res.narratives ?? []) {
      if (ids.has(n.listing_id) && typeof n.text === "string" && n.text.trim()) out.set(n.listing_id, n.text.trim().slice(0, 1200));
    }
  } catch (err) {
    // The numbers stand on their own; the page says the summary is unavailable.
    console.error("narrative generation failed", err);
  }
  return out;
}
