// LIVE=1 npx vitest run tests/scrape.live.test.ts
import { it } from "vitest";
import { readListingPage } from "@/lib/scrape";

it("reads real listing sites (report only)", async () => {
  for (const u of [
    "https://www.nobroker.in/flats-for-rent-in-baner_pune",
    "https://www.magicbricks.com/flats-for-rent-in-baner-pune-pppfr",
    "https://housing.com/in/rent/flats-for-rent-in-baner-pune-P38f9yfbk7p3m2h1f",
    "https://www.99acres.com/rent-property-in-baner-pune-ffid",
    "http://localhost:3000/x",
  ]) {
    const r = await readListingPage(u);
    console.log(u.slice(0, 50), "->", r.ok ? `OK ${r.text.length} chars: ${r.text.slice(0, 120).replace(/\n/g, " ")}` : `NO: ${r.reason}`);
  }
}, 90000);
