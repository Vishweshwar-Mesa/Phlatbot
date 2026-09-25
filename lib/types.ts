// Shared domain types. Field names mirror the Supabase columns / JSON shapes.

export type Furnishing = "furnished" | "semi" | "unfurnished";

/** Strict extraction schema. Every field is null when the text doesn't say. */
export interface ListingStructured {
  location: string | null;
  normalized_locality: string | null;
  monthly_rent: number | null;
  floor: string | null;
  has_lift: boolean | null;
  has_parking: boolean | null;
  bathrooms: number | null;
  pet_friendly: boolean | null;
  bachelor_friendly: boolean | null;
  furnishing: Furnishing | null;
  security_deposit: number | null;
  brokerage: string | null;
  available_from: string | null;
  notice_period_months: number | null;
  other_notes: string | null;
  extraction_confidence: "high" | "medium" | "low";
  latitude?: number | null;
  longitude?: number | null;
}

/** Listing fields that feed a hard constraint; a null here is asked about, never guessed. */
export const HARD_FIELDS = [
  "monthly_rent",
  "has_lift",
  "has_parking",
  "bathrooms",
  "pet_friendly",
  "bachelor_friendly",
] as const;
export type HardField = (typeof HARD_FIELDS)[number];

export interface SoftPreference {
  label: string;
  weight: number; // 1-5
  is_custom: boolean;
}

export interface Preferences {
  participant_id: string;
  max_rent: number; // the person's own share per month
  no_go_areas: string[];
  min_bathrooms: number;
  requires_lift: boolean;
  requires_parking: boolean;
  requires_pet_friendly: boolean;
  requires_bachelor_friendly: boolean;
  soft_preferences: SoftPreference[];
  updated_at?: string;
}

export interface Participant {
  id: string;
  name: string;
  telegram_user_id: number | null;
  form_token: string;
  form_submitted_at: string | null;
}

export type ListingStatus =
  | "draft"
  | "awaiting_preferences"
  | "pending"
  | "assessed_unpublished"
  | "published";

export interface Listing {
  id: string;
  raw_text: string;
  submitted_by_telegram_id: number;
  submitted_at: string;
  confirmed_at: string | null;
  dedupe_hash: string | null;
  structured: ListingStructured;
  clarifications: Partial<Record<HardField, unknown>>;
  missing_fields: HardField[];
  extraction_status: "ok" | "needs_clarification";
  status: ListingStatus;
  draft_stage: "awaiting_answers" | "awaiting_confirm" | "awaiting_edit" | null;
  published_batch_run_id: string | null;
}

/** Outcome of one soft preference against one listing. */
export type SoftOutcome = "matched" | "not_matched" | "no_data";

export interface SoftMatchNote {
  label: string;
  weight: number;
  is_custom: boolean;
  outcome: SoftOutcome;
  evidence: string; // what in the listing produced this outcome
}

/** A no-go area that loosely resembles the listing's locality; needs the person to confirm. */
export interface AmbiguousFlag {
  no_go_area: string;
  normalized_locality: string;
  why: string;
}

export interface PersonAssessment {
  participant_id: string;
  name: string;
  status: "qualifies" | "disqualified";
  reasons: string[]; // why disqualified (empty if qualifies)
  unconfirmed: string[]; // hard checks that couldn't be decided because the listing is silent
  soft_match_notes: SoftMatchNote[];
  soft_score: number | null; // 0-1, null if no preferences (or disqualified)
  flagged_ambiguous: AmbiguousFlag[];
}

export interface ListingVerdict {
  listing_id: string;
  per_person: PersonAssessment[];
  qualify_count: number;
  overall_rank: "all 3" | "2 of 3" | "1 of 3" | "disqualified";
  soft_score: number | null;
  unconfirmed_count: number;
}
