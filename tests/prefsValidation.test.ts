import { describe, expect, it } from "vitest";
import { validatePrefs, type FormPayload } from "@/lib/prefsValidation";

const base: FormPayload = {
  max_rent: 18000,
  min_bathrooms: 2,
  no_go_areas: ["Whitefield", " whitefield ", "", "Electronic City"],
  requires_lift: true,
  requires_parking: false,
  requires_pet_friendly: false,
  requires_bachelor_friendly: true,
  starter_weights: { Furnished: 5, Balcony: 0, "Quiet locality": 2 },
  custom: [],
};
const approveAll = () => true;
const approveNone = () => false;

describe("validatePrefs", () => {
  it("accepts a complete form, drops zero weights and de-dupes areas", () => {
    const r = validatePrefs(base, approveAll);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.prefs.no_go_areas).toEqual(["Whitefield", "Electronic City"]);
    expect(r.prefs.soft_preferences).toEqual([
      { label: "Furnished", weight: 5, is_custom: false },
      { label: "Quiet locality", weight: 2, is_custom: false },
    ]);
  });

  it("never defaults an unanswered hard toggle", () => {
    const r = validatePrefs({ ...base, requires_lift: undefined }, approveAll);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/Lift/);
  });

  it("requires rent and bathrooms", () => {
    const r = validatePrefs({ ...base, max_rent: null, min_bathrooms: "" }, approveAll);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toHaveLength(2);
  });

  it("rejects a custom factor without a valid relevance approval", () => {
    const r = validatePrefs({ ...base, custom: [{ label: "Gym", weight: 3, approval: "x" }] }, approveNone);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/relevance check/);
  });

  it("keeps approved custom factors, flagged is_custom", () => {
    const r = validatePrefs({ ...base, custom: [{ label: "  Gym  in building ", weight: 4, approval: "ok" }] }, approveAll);
    expect(r.ok && r.prefs.soft_preferences.at(-1)).toEqual({ label: "Gym in building", weight: 4, is_custom: true });
  });

  it("rejects weights outside 1-5 for custom and 0-5 for starters", () => {
    expect(validatePrefs({ ...base, starter_weights: { Furnished: 7 } }, approveAll).ok).toBe(false);
    expect(validatePrefs({ ...base, custom: [{ label: "Gym", weight: 0, approval: "ok" }] }, approveAll).ok).toBe(false);
  });

  it("rejects a custom factor that duplicates a starter label", () => {
    expect(validatePrefs({ ...base, custom: [{ label: "balcony", weight: 3, approval: "ok" }] }, approveAll).ok).toBe(false);
  });
});
