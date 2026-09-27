// The matching engine: pure, deterministic functions. No LLM anywhere in here.
//  1. hard filter (binary pass/fail per person, with reasons; null = "not confirmed", never a fail)
//  2. weighted soft score for people who pass (matched weight / total weight)
//  3. ranking: qualify count > soft score > fewer unconfirmed fields
import type {
  AmbiguousFlag,
  ListingStructured,
  ListingVerdict,
  PersonAssessment,
  Preferences,
  SoftMatchNote,
  SoftOutcome,
} from "./types";

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/** key = `${locality.toLowerCase()}|${area.toLowerCase()}` -> the person's answer (true = it IS a no-go). */
export type NoGoAnswers = Map<string, boolean | null>;
export const noGoKey = (locality: string, area: string) => `${locality.toLowerCase()}|${area.toLowerCase()}`;

// ------------------------------------------------------------------ fuzzy helpers

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/**
 * How a no-go area relates to a listing's locality.
 * clean: a case-insensitive substring match. ambiguous: word overlap (3+ letters) or a near-spelling.
 */
export function noGoMatch(locality: string, area: string): { kind: "clean" | "ambiguous" | "none"; why: string } {
  const loc = locality.toLowerCase().trim();
  const a = area.toLowerCase().trim();
  if (!a) return { kind: "none", why: "" };
  if (loc.includes(a)) return { kind: "clean", why: `"${locality}" contains "${area}"` };
  const lw = words(loc);
  const aw = words(a);
  const shared = aw.filter((w) => w.length >= 3 && lw.includes(w));
  if (shared.length) return { kind: "ambiguous", why: `shares the word "${shared[0]}"` };
  if (a.length >= 5 && levenshtein(loc, a) <= 2) return { kind: "ambiguous", why: `is spelled almost like "${area}"` };
  for (const w of aw) {
    if (w.length < 5) continue;
    const near = lw.find((x) => x.length >= 5 && levenshtein(x, w) <= 2);
    if (near) return { kind: "ambiguous", why: `"${near}" is spelled almost like "${w}"` };
  }
  return { kind: "none", why: "" };
}

// ------------------------------------------------------------------ step 1: hard filter

/**
 * Three people, so bedrooms decide who must share: 3+ -> nobody, 2 -> two people, 1 -> all three.
 * `willing` = how many of the three said they're OK sharing a bedroom.
 */
export function sharersNeeded(bedrooms: number): number {
  return bedrooms >= 3 ? 0 : bedrooms === 2 ? 2 : 3;
}

export function hardFilter(
  s: ListingStructured,
  p: Preferences,
  noGo: NoGoAnswers,
  willing = 0,
): Pick<PersonAssessment, "status" | "reasons" | "unconfirmed" | "flagged_ambiguous" | "compromises"> {
  const reasons: string[] = [];
  const unconfirmed: string[] = [];
  const compromises: string[] = [];
  const flagged: AmbiguousFlag[] = [];

  if (s.monthly_rent === null) unconfirmed.push("Rent not confirmed");
  else if (s.monthly_rent / 3 > p.max_rent)
    reasons.push(`Rent share ${inr(s.monthly_rent / 3)} is over the max ${inr(p.max_rent)}`);

  if (p.no_go_areas.length) {
    if (!s.normalized_locality) unconfirmed.push("Locality not confirmed, so no-go areas can't be checked");
    else
      for (const area of p.no_go_areas) {
        const m = noGoMatch(s.normalized_locality, area);
        if (m.kind === "clean") reasons.push(`In no-go area "${area}"`);
        else if (m.kind === "ambiguous") {
          const answer = noGo.get(noGoKey(s.normalized_locality, area));
          if (answer === true) reasons.push(`Confirmed: ${s.normalized_locality} is inside no-go area "${area}"`);
          else if (answer !== false)
            flagged.push({ no_go_area: area, normalized_locality: s.normalized_locality, why: m.why });
        }
      }
  }

  const beds = s.bedrooms ?? null;
  if (beds === null) unconfirmed.push("Bedrooms not confirmed");
  else {
    const need = sharersNeeded(beds);
    if (need > 0) {
      if (p.ok_to_share_room === false) reasons.push(`Only ${beds} bedroom(s) for 3 people, and doesn't want to share a room`);
      else if (p.ok_to_share_room === null || p.ok_to_share_room === undefined) unconfirmed.push("Room-sharing answer not given");
      else if (willing < need) reasons.push(`Only ${beds} bedroom(s) for 3 people, and not enough of you are willing to share`);
      else compromises.push(need === 3 ? "Everyone shares one bedroom" : `Would share a bedroom (${beds} bedrooms for 3)`);
    }
  }

  if (s.bathrooms === null) unconfirmed.push("Bathrooms not confirmed");
  else if (s.bathrooms < p.min_bathrooms) reasons.push(`${s.bathrooms} bathroom(s), needs at least ${p.min_bathrooms}`);

  const binary: [boolean, boolean | null, string][] = [
    [p.requires_lift, s.has_lift, "lift"],
    [p.requires_parking, s.has_parking, "parking"],
    [p.requires_pet_friendly, s.pet_friendly, "pet-friendly"],
    [p.requires_bachelor_friendly, s.bachelor_friendly, "bachelor-friendly"],
  ];
  for (const [required, has, label] of binary) {
    if (!required) continue;
    if (has === false) reasons.push(label === "lift" || label === "parking" ? `No ${label} (required)` : `Not ${label} (required)`);
    else if (has === null) unconfirmed.push(`${label[0].toUpperCase() + label.slice(1)} not confirmed`);
  }

  return { status: reasons.length ? "disqualified" : "qualifies", reasons, unconfirmed, flagged_ambiguous: flagged, compromises };
}

// ------------------------------------------------------------------ step 2: soft score

const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "with", "for", "near", "nearby", "proximity", "close",
  "good", "reliable", "reliability", "supply", "locality", "society", "amenities", "building", "flat", "compliant",
  "natural", "public", "area", "access", "lots", "plenty", "e", "g", "eg", "etc", "is", "has", "have",
]);
const SYNONYMS: Record<string, string[]> = {
  light: ["sunlight", "well lit", "well-lit", "bright", "natural light", "light"],
  ventilation: ["ventilat", "airy", "cross breeze"],
  balcony: ["balcon"],
  power: ["power backup", "dg backup", "generator", "inverter"],
  backup: ["backup"],
  security: ["security", "guard", "gated", "cctv"],
  quiet: ["quiet", "peaceful", "calm", "silent"],
  transport: ["metro", "bus stop", "bus", "station", "transport"],
  metro: ["metro"],
  vastu: ["vastu"],
  water: ["water", "borewell", "cauvery"],
  gym: ["gym"],
};
// Labels that map onto a structured field, checked identically for predefined and custom labels.
const FIELD_RULES: { test: RegExp; check: (s: ListingStructured) => { outcome: SoftOutcome; evidence: string } }[] = [
  {
    test: /furnish/,
    check: (s) =>
      s.furnishing === null
        ? { outcome: "no_data", evidence: "Furnishing not mentioned" }
        : s.furnishing === "furnished"
          ? { outcome: "matched", evidence: "Furnished" }
          : { outcome: "not_matched", evidence: s.furnishing === "semi" ? "Semi-furnished" : "Unfurnished" },
  },
  { test: /parking/, check: (s) => boolField(s.has_parking, "Parking") },
  { test: /\b(lift|elevator)\b/, check: (s) => boolField(s.has_lift, "Lift") },
  { test: /\bpets?\b/, check: (s) => boolField(s.pet_friendly, "Pets allowed") },
  { test: /bachelor/, check: (s) => boolField(s.bachelor_friendly, "Bachelors allowed") },
];
function boolField(v: boolean | null, label: string): { outcome: SoftOutcome; evidence: string } {
  if (v === null) return { outcome: "no_data", evidence: `${label}: not mentioned` };
  return v ? { outcome: "matched", evidence: label } : { outcome: "not_matched", evidence: `${label}: no` };
}

export function keywordsFor(label: string): string[] {
  const ws = words(label).filter((w) => !STOP.has(w) && w.length >= 3);
  const out = new Set<string>();
  for (const w of ws) {
    out.add(w);
    for (const syn of SYNONYMS[w] ?? []) out.add(syn);
  }
  return [...out];
}

export function matchSoft(label: string, s: ListingStructured): { outcome: SoftOutcome; evidence: string } {
  const l = label.toLowerCase();
  const rule = FIELD_RULES.find((r) => r.test.test(l));
  if (rule) return rule.check(s);
  const notes = (s.other_notes ?? "").toLowerCase();
  if (!notes) return { outcome: "no_data", evidence: "Not mentioned in the listing" };
  for (const k of keywordsFor(label)) {
    const idx = notes.indexOf(k);
    if (idx === -1) continue;
    const before = notes.slice(Math.max(0, idx - 12), idx);
    if (/\b(no|without|not|lacks?)\s+(\w+\s)?$/.test(before)) return { outcome: "not_matched", evidence: `Listing says "${before.trim()} ${k}"` };
    return { outcome: "matched", evidence: `Listing mentions "${k}"` };
  }
  return { outcome: "no_data", evidence: "Not mentioned in the listing" };
}

export function softScore(p: Preferences, s: ListingStructured): { notes: SoftMatchNote[]; score: number | null } {
  const prefs = p.soft_preferences.filter((x) => x.weight >= 1);
  if (!prefs.length) return { notes: [], score: null };
  const notes = prefs.map((x) => ({ ...x, ...matchSoft(x.label, s) }));
  const total = notes.reduce((t, n) => t + n.weight, 0);
  const matched = notes.filter((n) => n.outcome === "matched").reduce((t, n) => t + n.weight, 0);
  return { notes, score: total ? matched / total : null };
}

// ------------------------------------------------------------------ assemble + rank

const HARD_LISTING_FIELDS: (keyof ListingStructured)[] = [
  "monthly_rent", "normalized_locality", "has_lift", "has_parking", "bathrooms", "bedrooms", "pet_friendly", "bachelor_friendly",
];

export function assessListing(
  listingId: string,
  s: ListingStructured,
  people: { id: string; name: string; prefs: Preferences }[],
  noGo: Map<string, NoGoAnswers>,
): ListingVerdict {
  const willing = people.filter((x) => x.prefs.ok_to_share_room === true).length;
  const per_person: PersonAssessment[] = people.map(({ id, name, prefs }) => {
    const hard = hardFilter(s, prefs, noGo.get(id) ?? new Map(), willing);
    const soft = hard.status === "qualifies" ? softScore(prefs, s) : { notes: [], score: null };
    return { participant_id: id, name, ...hard, soft_match_notes: soft.notes, soft_score: soft.score };
  });
  const qualify_count = per_person.filter((p) => p.status === "qualifies").length;
  const scored = per_person.filter((p) => p.status === "qualifies" && p.soft_score !== null);
  return {
    listing_id: listingId,
    per_person,
    qualify_count,
    overall_rank: qualify_count === 3 ? "all 3" : qualify_count === 2 ? "2 of 3" : qualify_count === 1 ? "1 of 3" : "disqualified",
    soft_score: scored.length ? scored.reduce((t, p) => t + p.soft_score!, 0) / scored.length : null,
    unconfirmed_count: HARD_LISTING_FIELDS.filter((f) => s[f] === null || s[f] === undefined).length,
  };
}

export function compareVerdicts(a: ListingVerdict, b: ListingVerdict): number {
  if (a.qualify_count !== b.qualify_count) return b.qualify_count - a.qualify_count;
  const sa = a.soft_score ?? -1;
  const sb = b.soft_score ?? -1;
  if (sa !== sb) return sb - sa;
  return a.unconfirmed_count - b.unconfirmed_count;
}

/** Top 3 qualifying listings for voting, the rest of the qualifiers shown below. Nobody-qualifies never surfaces. */
export function shortlist(verdicts: ListingVerdict[]): { top: ListingVerdict[]; also: ListingVerdict[] } {
  const ranked = verdicts.filter((v) => v.qualify_count > 0).sort(compareVerdicts);
  return { top: ranked.slice(0, 3), also: ranked.slice(3) };
}
