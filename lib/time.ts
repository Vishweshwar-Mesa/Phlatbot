// All schedule logic is expressed in Asia/Kolkata explicitly (IST = UTC+05:30, no DST).

export const IST_TZ = "Asia/Kolkata";

/** Calendar date (YYYY-MM-DD) in Asia/Kolkata for the given instant. */
export function istDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/**
 * The digest cutoff for a run at `now`: 18:00 IST on the IST calendar day of `now`.
 * Listings submitted before it are assessed in that day's digest; later ones roll over.
 */
export function digestCutoff(now: Date = new Date()): Date {
  return new Date(`${istDate(now)}T18:00:00+05:30`);
}

export function formatIst(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TZ,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export const AUTO_REVEAL_MS = 24 * 60 * 60 * 1000;
