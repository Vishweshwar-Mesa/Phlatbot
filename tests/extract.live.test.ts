// Live Gemini check (costs a call): LIVE=1 npx vitest run tests/extract.live.test.ts
import { expect, it } from "vitest";
import { extractListing } from "@/lib/extract";

it("extracts stated fields and leaves unstated ones null", async () => {
  const s = await extractListing(
    "3BHK for rent in HSR Layout sector 2, near 27th main. Rent 54k/month, deposit 3 months. 2 bathrooms, " +
      "semi-furnished, covered car parking. Bachelors welcome. Balcony, power backup, 24x7 water. Available from 1st Nov.",
  );
  console.log(JSON.stringify(s, null, 1));
  expect(s.monthly_rent).toBe(54000);
  expect(s.security_deposit).toBe(162000);
  expect(s.bathrooms).toBe(2);
  expect(s.has_parking).toBe(true);
  expect(s.bachelor_friendly).toBe(true);
  expect(s.has_lift).toBeNull(); // not mentioned
  expect(s.pet_friendly).toBeNull(); // not mentioned
  expect(s.furnishing).toBe("semi");
}, 60000);
