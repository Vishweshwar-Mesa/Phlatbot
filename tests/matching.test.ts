import { describe, expect, it } from "vitest";
import { assessListing, hardFilter, matchSoft, noGoKey, noGoMatch, shortlist, softScore } from "@/lib/matching";
import type { ListingStructured, Preferences } from "@/lib/types";

const L = (o: Partial<ListingStructured> = {}): ListingStructured => ({
  location: "HSR Layout", normalized_locality: "HSR Layout", monthly_rent: 54000, floor: "3", has_lift: true,
  has_parking: true, bathrooms: 2, bedrooms: 3, pet_friendly: false, bachelor_friendly: true, furnishing: "semi",
  security_deposit: 162000, brokerage: null, available_from: null, notice_period_months: null,
  other_notes: "balcony, power backup, 24x7 water, near metro", extraction_confidence: "high", ...o,
});
const P = (o: Partial<Preferences> = {}): Preferences => ({
  participant_id: "r", max_rent: 19000, no_go_areas: [], min_bathrooms: 2, requires_lift: false,
  requires_parking: false, requires_pet_friendly: false, requires_bachelor_friendly: false, ok_to_share_room: false, soft_preferences: [], ...o,
});

describe("hard filter", () => {
  it("passes a listing that meets everything", () => {
    expect(hardFilter(L(), P(), new Map()).status).toBe("qualifies");
  });
  it("fails on rent share with the specific reason", () => {
    const r = hardFilter(L({ monthly_rent: 60000 }), P({ max_rent: 19000 }), new Map());
    expect(r.status).toBe("disqualified");
    expect(r.reasons[0]).toMatch(/₹20,000.*₹19,000/);
  });
  it("treats nulls as not confirmed, never as a fail", () => {
    const r = hardFilter(L({ has_lift: null, monthly_rent: null, bathrooms: null }), P({ requires_lift: true }), new Map());
    expect(r.status).toBe("qualifies");
    expect(r.unconfirmed).toEqual(["Rent not confirmed", "Bathrooms not confirmed", "Lift not confirmed"]);
  });
  it("fails binary requirements that are explicitly false", () => {
    const r = hardFilter(L({ pet_friendly: false }), P({ requires_pet_friendly: true }), new Map());
    expect(r.status).toBe("disqualified");
  });
  it("disqualifies a clean no-go substring match", () => {
    const r = hardFilter(L({ normalized_locality: "Whitefield, ITPL" }), P({ no_go_areas: ["whitefield"] }), new Map());
    expect(r.reasons[0]).toMatch(/no-go area "whitefield"/);
  });
  it("flags an ambiguous no-go match instead of deciding", () => {
    const r = hardFilter(L({ normalized_locality: "Koramangala 8th Block" }), P({ no_go_areas: ["Koramangla"] }), new Map());
    expect(r.status).toBe("qualifies");
    expect(r.flagged_ambiguous).toHaveLength(1);
  });
  it("uses the person's confirmation once given", () => {
    const answers = new Map([[noGoKey("Koramangala 8th Block", "Koramangla"), true]]);
    const r = hardFilter(L({ normalized_locality: "Koramangala 8th Block" }), P({ no_go_areas: ["Koramangla"] }), answers);
    expect(r.status).toBe("disqualified");
  });
});

describe("bedrooms for three", () => {
  const trio = (share: [boolean, boolean, boolean]) =>
    ["r", "m", "k"].map((id, i) => ({ id, name: id, prefs: P({ participant_id: id, ok_to_share_room: share[i] }) }));
  it("3 bedrooms: nobody shares", () => {
    const v = assessListing("a", L({ bedrooms: 3 }), trio([false, false, false]), new Map());
    expect(v.qualify_count).toBe(3);
    expect(v.per_person.every((p) => !p.compromises?.length)).toBe(true);
  });
  it("2 bedrooms: two willing sharers pass (with the compromise shown), the other needs their own room", () => {
    const v = assessListing("a", L({ bedrooms: 2 }), trio([true, true, false]), new Map());
    expect(v.per_person.map((p) => p.status)).toEqual(["qualifies", "qualifies", "disqualified"]);
    expect(v.per_person[0].compromises?.[0]).toMatch(/share a bedroom/);
    expect(v.per_person[2].reasons[0]).toMatch(/doesn't want to share/);
  });
  it("2 bedrooms with only one willing sharer: out for everyone", () => {
    const v = assessListing("a", L({ bedrooms: 2 }), trio([true, false, false]), new Map());
    expect(v.qualify_count).toBe(0);
    expect(v.per_person[0].reasons[0]).toMatch(/not enough of you/);
  });
  it("unknown bedrooms is not confirmed, never a fail", () => {
    const v = assessListing("a", L({ bedrooms: null }), trio([false, false, false]), new Map());
    expect(v.qualify_count).toBe(3);
    expect(v.per_person[0].unconfirmed).toContain("Bedrooms not confirmed");
  });
});

describe("noGoMatch", () => {
  it("classifies clean, ambiguous and none", () => {
    expect(noGoMatch("Electronic City Phase 1", "Electronic City").kind).toBe("clean");
    expect(noGoMatch("Koramangala 5th Block", "Koramangla").kind).toBe("ambiguous");
    expect(noGoMatch("JP Nagar", "RT Nagar").kind).toBe("ambiguous"); // shared word "nagar"
    expect(noGoMatch("Indiranagar", "Whitefield").kind).toBe("none");
  });
});

describe("soft score", () => {
  it("matches structured fields and notes, same rules for custom labels", () => {
    expect(matchSoft("Furnished", L({ furnishing: "furnished" })).outcome).toBe("matched");
    expect(matchSoft("Furnished", L({ furnishing: "semi" })).outcome).toBe("not_matched");
    expect(matchSoft("Balcony", L()).outcome).toBe("matched");
    expect(matchSoft("Proximity to public transport", L()).outcome).toBe("matched");
    expect(matchSoft("Gym in the building", L()).outcome).toBe("no_data");
    expect(matchSoft("Balcony", L({ other_notes: "no balcony, lift" })).outcome).toBe("not_matched");
  });
  it("computes matched weight / total weight, and null with no preferences", () => {
    const p = P({
      soft_preferences: [
        { label: "Balcony", weight: 4, is_custom: false },
        { label: "Furnished", weight: 5, is_custom: false },
        { label: "Gym in the building", weight: 1, is_custom: true },
      ],
    });
    expect(softScore(p, L()).score).toBeCloseTo(0.4); // 4 / 10
    expect(softScore(P(), L()).score).toBeNull();
  });
});

describe("assess + rank", () => {
  const people = [
    { id: "r", name: "Riya", prefs: P({ participant_id: "r", soft_preferences: [{ label: "Balcony", weight: 5, is_custom: false }] }) },
    { id: "m", name: "Meera", prefs: P({ participant_id: "m", requires_parking: true }) },
    { id: "k", name: "Kavita", prefs: P({ participant_id: "k", max_rent: 17000 }) },
  ];
  it("excludes zero-preference people from the soft average", () => {
    const v = assessListing("a", L({ monthly_rent: 48000 }), people, new Map());
    expect(v.qualify_count).toBe(3);
    expect(v.soft_score).toBe(1); // only Riya has preferences
  });
  it("ranks by qualify count first; soft score never overrides it", () => {
    const allThreeLowScore = assessListing("a", L({ monthly_rent: 48000, other_notes: null }), people, new Map());
    const twoHighScore = assessListing("b", L({ monthly_rent: 54000 }), people, new Map()); // Kavita out on rent
    const nobody = assessListing("c", L({ monthly_rent: 90000 }), people, new Map());
    const { top, also } = shortlist([twoHighScore, nobody, allThreeLowScore]);
    expect(top.map((v) => v.listing_id)).toEqual(["a", "b"]);
    expect(also).toEqual([]);
  });
  it("breaks remaining ties by fewer unconfirmed fields", () => {
    const a = assessListing("a", L({ monthly_rent: 48000, has_lift: null }), people, new Map());
    const b = assessListing("b", L({ monthly_rent: 48000 }), people, new Map());
    expect(shortlist([a, b]).top[0].listing_id).toBe("b");
  });
});
