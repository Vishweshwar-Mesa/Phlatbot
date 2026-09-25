import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";
import { normalizeLabel } from "./softFactors";

// When a custom factor passes the live relevance check, the server hands back a signed
// approval so the save step can verify it without re-asking Gemini (whose answer could differ).

function sign(participantId: string, label: string): string {
  return createHmac("sha256", `custom-factor:${env("CRON_SECRET")}`)
    .update(`${participantId}\n${normalizeLabel(label).toLowerCase()}`)
    .digest("hex");
}

export function approvalFor(participantId: string, label: string): string {
  return sign(participantId, label);
}

export function approvalValid(participantId: string, label: string, approval: unknown): boolean {
  if (typeof approval !== "string") return false;
  const a = Buffer.from(approval);
  const b = Buffer.from(sign(participantId, label));
  return a.length === b.length && timingSafeEqual(a, b);
}
