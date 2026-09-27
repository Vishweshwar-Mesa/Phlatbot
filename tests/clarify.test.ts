import { describe, expect, it } from "vitest";
import { parseClarification, parseRupees } from "@/lib/clarify";

describe("parseRupees", () => {
  it("handles common formats", () => {
    expect(parseRupees("54000")).toBe(54000);
    expect(parseRupees("54,000")).toBe(54000);
    expect(parseRupees("₹54k")).toBe(54000);
    expect(parseRupees("1.2L")).toBe(120000);
    expect(parseRupees("abc")).toBeNull();
  });
});

describe("parseClarification", () => {
  const asked = ["has_parking", "has_lift", "monthly_rent", "bathrooms"] as const;

  it("parses yes/no, numbers and don't know", () => {
    const r = parseClarification("parking: yes\nlift: don't know\nrent: 54k\nbathrooms: 2", [...asked]);
    expect(r.problems).toEqual([]);
    expect(r.answers).toEqual({
      has_parking: { value: true },
      has_lift: { value: null },
      monthly_rent: { value: 54000 },
      bathrooms: { value: 2 },
    });
  });

  it("explains unreadable lines instead of guessing", () => {
    const r = parseClarification("parking: maybe\nsomething random\npets: yes", [...asked]);
    expect(r.answers).toEqual({});
    expect(r.problems).toHaveLength(3);
  });

  it("reads bedrooms including '2 BHK'", () => {
    expect(parseClarification("bedrooms: 2 BHK", ["bedrooms"]).answers).toEqual({ bedrooms: { value: 2 } });
    expect(parseClarification("bhk: 3", ["bedrooms"]).answers).toEqual({ bedrooms: { value: 3 } });
  });

  it("accepts partial answers", () => {
    const r = parseClarification("Lift = no", [...asked]);
    expect(r.answers).toEqual({ has_lift: { value: false } });
  });
});
