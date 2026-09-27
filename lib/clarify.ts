import { HARD_FIELDS, type HardField, type ListingStructured } from "./types";

// Deterministic parsing of the submitter's one-message answer to "this listing doesn't mention X".
// Format, one per line:  parking: yes   |  rent: 54000  |  lift: don't know

export const FIELD_LABEL: Record<HardField, string> = {
  monthly_rent: "rent",
  has_lift: "lift",
  has_parking: "parking",
  bathrooms: "bathrooms",
  bedrooms: "bedrooms",
  pet_friendly: "pets",
  bachelor_friendly: "bachelors",
};

export const FIELD_QUESTION: Record<HardField, string> = {
  monthly_rent: "total monthly rent for the whole flat (₹)",
  has_lift: "does the building have a lift?",
  has_parking: "does it come with parking?",
  bathrooms: "how many bathrooms?",
  bedrooms: "how many bedrooms? (e.g. 2 for a 2 BHK)",
  pet_friendly: "are pets allowed?",
  bachelor_friendly: "are bachelors allowed?",
};

const ALIASES: Record<string, HardField> = {
  rent: "monthly_rent", "monthly rent": "monthly_rent", price: "monthly_rent",
  lift: "has_lift", elevator: "has_lift",
  parking: "has_parking", "car parking": "has_parking",
  bathrooms: "bathrooms", bathroom: "bathrooms", baths: "bathrooms", bath: "bathrooms",
  bedrooms: "bedrooms", bedroom: "bedrooms", beds: "bedrooms", bhk: "bedrooms", rooms: "bedrooms",
  pets: "pet_friendly", pet: "pet_friendly", "pet friendly": "pet_friendly", "pet-friendly": "pet_friendly",
  bachelors: "bachelor_friendly", bachelor: "bachelor_friendly", "bachelor friendly": "bachelor_friendly",
  "bachelor-friendly": "bachelor_friendly",
};

const BOOL_FIELDS = new Set<HardField>(["has_lift", "has_parking", "pet_friendly", "bachelor_friendly"]);
const UNKNOWN = /^(don'?t know|dont know|do not know|not sure|unsure|no idea|unknown|dk|idk|\?)$/i;

export type ParsedAnswer = { value: number | boolean | null }; // null = submitter doesn't know

export interface ClarifyResult {
  answers: Partial<Record<HardField, ParsedAnswer>>;
  problems: string[]; // lines we couldn't understand, explained
}

/** Parses a rupee amount like "54000", "54,000", "54k", "₹54k", "1.2L". */
export function parseRupees(s: string): number | null {
  const t = s.toLowerCase().replace(/[₹,\s]|rs\.?|inr/g, "");
  const m = t.match(/^(\d+(?:\.\d+)?)(k|l|lakh|lac)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]) * (m[2] === "k" ? 1000 : m[2] ? 100000 : 1);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function parseClarification(text: string, asked: HardField[]): ClarifyResult {
  const answers: ClarifyResult["answers"] = {};
  const problems: string[] = [];
  for (const rawLine of text.split(/\n|;/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^([a-z][a-z -]*?)\s*[:=\-–]\s*(.+)$/i);
    if (!m) {
      problems.push(`I couldn't read "${line}". Use the form "field: answer".`);
      continue;
    }
    const field = ALIASES[m[1].trim().toLowerCase()];
    const val = m[2].trim();
    if (!field || !asked.includes(field)) {
      problems.push(`"${m[1].trim()}" isn't one of the details I asked about.`);
      continue;
    }
    if (UNKNOWN.test(val)) {
      answers[field] = { value: null };
    } else if (BOOL_FIELDS.has(field)) {
      if (/^(y|yes|yeah|yep|true|available|allowed|ok)$/i.test(val)) answers[field] = { value: true };
      else if (/^(n|no|nope|false|not available|not allowed|none)$/i.test(val)) answers[field] = { value: false };
      else problems.push(`For ${FIELD_LABEL[field]}, answer yes, no, or don't know.`);
    } else if (field === "monthly_rent") {
      const n = parseRupees(val);
      if (n === null) problems.push(`For rent, give a number like 54000 or 54k, or say don't know.`);
      else answers[field] = { value: n };
    } else {
      const n = Number(val);
      const m = val.match(/^(\d+)\s*(bhk|rk)?$/i);
      const n2 = m ? Number(m[1]) : n;
      if (!Number.isInteger(n2) || n2 < 0 || n2 > 10) problems.push(`For ${FIELD_LABEL[field]}, give a whole number, or say don't know.`);
      else answers[field] = { value: n2 };
    }
  }
  return { answers, problems };
}

export function missingHardFields(s: ListingStructured): HardField[] {
  return HARD_FIELDS.filter((f) => s[f] === null);
}

export function questionMessage(fields: HardField[], intro: string): string {
  return [
    intro,
    "",
    ...fields.map((f) => `• ${FIELD_LABEL[f]}: ${FIELD_QUESTION[f]}`),
    "",
    "Reply in one message, one per line, like:",
    ...fields.map((f) => `${FIELD_LABEL[f]}: ${f === "monthly_rent" ? "54000" : f === "bathrooms" ? "2" : f === "bedrooms" ? "3" : "yes"}`),
    "",
    `If you don't know, write "don't know". It will show as not confirmed.`,
  ].join("\n");
}
