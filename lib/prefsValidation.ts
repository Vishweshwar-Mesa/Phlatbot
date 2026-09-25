import { MAX_CUSTOM_FACTORS, MAX_LABEL_LENGTH, normalizeLabel, STARTER_FACTORS } from "./softFactors";
import type { SoftPreference } from "./types";

// Validates the form payload. Hard constraints must be explicitly answered; nothing is defaulted.

export interface FormPayload {
  max_rent: unknown;
  min_bathrooms: unknown;
  no_go_areas: unknown;
  requires_lift: unknown;
  requires_parking: unknown;
  requires_pet_friendly: unknown;
  requires_bachelor_friendly: unknown;
  starter_weights: unknown; // { [starter label]: 0-5 }
  custom: unknown; // [{ label, weight, approval }]
}

export interface ValidPrefs {
  max_rent: number;
  min_bathrooms: number;
  no_go_areas: string[];
  requires_lift: boolean;
  requires_parking: boolean;
  requires_pet_friendly: boolean;
  requires_bachelor_friendly: boolean;
  soft_preferences: SoftPreference[];
}

export type ApprovalCheck = (label: string, approval: unknown) => boolean;

const BOOL_FIELDS = [
  ["requires_lift", "Lift"],
  ["requires_parking", "Parking"],
  ["requires_pet_friendly", "Pet-friendly"],
  ["requires_bachelor_friendly", "Bachelor-friendly"],
] as const;

function isWeight(n: unknown, allowZero: boolean): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= (allowZero ? 0 : 1) && n <= 5;
}

export function validatePrefs(
  body: FormPayload,
  approvalOk: ApprovalCheck,
): { ok: true; prefs: ValidPrefs } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  const rent = Number(body.max_rent);
  if (!Number.isInteger(rent) || rent < 1000 || rent > 1_000_000) {
    errors.push("Max rent (your share) must be a whole number of rupees between 1,000 and 10,00,000.");
  }
  const baths = Number(body.min_bathrooms);
  if (!Number.isInteger(baths) || baths < 1 || baths > 6) {
    errors.push("Minimum bathrooms must be a whole number from 1 to 6.");
  }

  const bools: Partial<Record<(typeof BOOL_FIELDS)[number][0], boolean>> = {};
  for (const [key, label] of BOOL_FIELDS) {
    const v = body[key];
    if (typeof v !== "boolean") errors.push(`Please choose Required or Not required for "${label}".`);
    else bools[key] = v;
  }

  const areasRaw = Array.isArray(body.no_go_areas) ? body.no_go_areas : [];
  const seenAreas = new Set<string>();
  const no_go_areas: string[] = [];
  for (const a of areasRaw) {
    if (typeof a !== "string") continue;
    const t = normalizeLabel(a);
    if (!t) continue;
    if (t.length > 60) errors.push(`No-go area "${t.slice(0, 20)}…" is too long (60 characters max).`);
    else if (!seenAreas.has(t.toLowerCase())) {
      seenAreas.add(t.toLowerCase());
      no_go_areas.push(t);
    }
  }
  if (no_go_areas.length > 15) errors.push("Please list at most 15 no-go areas.");

  const soft: SoftPreference[] = [];
  const weights = (body.starter_weights ?? {}) as Record<string, unknown>;
  for (const label of STARTER_FACTORS) {
    const w = weights[label] ?? 0;
    if (!isWeight(w, true)) errors.push(`Importance for "${label}" must be 0–5.`);
    else if (w > 0) soft.push({ label, weight: w, is_custom: false });
  }

  const custom = Array.isArray(body.custom) ? body.custom : [];
  if (custom.length > MAX_CUSTOM_FACTORS) errors.push(`At most ${MAX_CUSTOM_FACTORS} custom factors.`);
  const taken = new Set(soft.map((s) => s.label.toLowerCase()).concat(STARTER_FACTORS.map((s) => s.toLowerCase())));
  for (const c of custom as { label?: unknown; weight?: unknown; approval?: unknown }[]) {
    const label = typeof c?.label === "string" ? normalizeLabel(c.label) : "";
    if (!label || label.length > MAX_LABEL_LENGTH) {
      errors.push(`Custom factors need a label of 1–${MAX_LABEL_LENGTH} characters.`);
      continue;
    }
    if (taken.has(label.toLowerCase())) {
      errors.push(`"${label}" is already in the list.`);
      continue;
    }
    if (!isWeight(c.weight, false)) {
      errors.push(`Custom factor "${label}" needs an importance from 1 to 5.`);
      continue;
    }
    if (!approvalOk(label, c.approval)) {
      errors.push(`Custom factor "${label}" hasn't passed the relevance check. Check it again, or remove it.`);
      continue;
    }
    taken.add(label.toLowerCase());
    soft.push({ label, weight: c.weight, is_custom: true });
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    prefs: {
      max_rent: rent,
      min_bathrooms: baths,
      no_go_areas,
      requires_lift: bools.requires_lift!,
      requires_parking: bools.requires_parking!,
      requires_pet_friendly: bools.requires_pet_friendly!,
      requires_bachelor_friendly: bools.requires_bachelor_friendly!,
      soft_preferences: soft,
    },
  };
}
