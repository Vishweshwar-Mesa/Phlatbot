import "server-only";
import { createHash } from "node:crypto";
import { FIELD_LABEL, missingHardFields, parseClarification, questionMessage } from "../clarify";
import { db, must } from "../db";
import { extractListing } from "../extract";
import { readiness } from "../participants";
import { sendMessage, TgMessage } from "../telegram";
import type { HardField, Listing, ListingStructured } from "../types";
import type { Sender } from "./index";

// Listing submission: extract -> ask about missing hard-constraint fields (one message)
// -> save (dedupe by hash of the listing text) -> into the pool.

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const yn = (v: boolean | null) => (v === null ? "not confirmed" : v ? "yes" : "no");
const val = <T,>(v: T | null, f: (x: T) => string = String) => (v === null ? "not confirmed" : f(v));

export function dedupeHash(text: string): string {
  return createHash("sha256").update(text.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex");
}

export function summary(s: ListingStructured, clar: Listing["clarifications"]): string {
  const src = (f: HardField) => (f in clar ? (clar[f] === null ? " (you didn't know)" : " (from you)") : "");
  return [
    `📍 ${val(s.normalized_locality)}`,
    `💰 Rent: ${val(s.monthly_rent, inr)}${s.monthly_rent !== null ? ` (${inr(s.monthly_rent / 3)} each)` : ""}${src("monthly_rent")}`,
    `🔐 Deposit: ${val(s.security_deposit, inr)} · Brokerage: ${val(s.brokerage)}`,
    `🛁 Bathrooms: ${val(s.bathrooms)}${src("bathrooms")} · Floor: ${val(s.floor)}`,
    `🛗 Lift: ${yn(s.has_lift)}${src("has_lift")} · 🚗 Parking: ${yn(s.has_parking)}${src("has_parking")}`,
    `🐾 Pets: ${yn(s.pet_friendly)}${src("pet_friendly")} · 🔑 Bachelors: ${yn(s.bachelor_friendly)}${src("bachelor_friendly")}`,
    `🛋 Furnishing: ${val(s.furnishing)} · Available: ${val(s.available_from)}`,
    s.other_notes ? `📝 ${s.other_notes}` : null,
  ].filter((l) => l !== null).join("\n");
}

async function myDraft(s: Sender): Promise<Listing | null> {
  const rows = must(
    await db().from("listings").select("*").eq("submitted_by_telegram_id", s.telegramId).eq("status", "draft")
      .order("submitted_at", { ascending: false }).limit(1),
  ) as Listing[];
  return rows[0] ?? null;
}

async function update(id: string, patch: Partial<Listing>) {
  must(await db().from("listings").update(patch).eq("id", id).select("id"));
}

/** Saves a fully-clarified draft into the pool. */
async function save(s: Sender, l: Listing) {
  const { ready, waiting } = await readiness();
  const res = await db()
    .from("listings")
    .update({
      dedupe_hash: dedupeHash(l.raw_text),
      confirmed_at: new Date().toISOString(),
      status: ready ? "pending" : "awaiting_preferences",
      draft_stage: null,
    })
    .eq("id", l.id)
    .eq("status", "draft")
    .select("id");
  if (res.error?.code === "23505") {
    must(await db().from("listings").delete().eq("id", l.id).select("id"));
    await sendMessage(s.telegramId, "This listing is already in Phlatmatch (same text), so I didn't add it again.");
    return;
  }
  must(res);
  await sendMessage(
    s.telegramId,
    [
      "Saved to Phlatmatch ✅",
      "",
      summary(l.structured, l.clarifications),
      "",
      ready
        ? "It'll be scored for the next shortlist at 7:05pm (listings after 6pm roll to tomorrow)."
        : `It'll be matched once everyone's constraints are in (waiting on ${waiting.map((w) => w.name).join(", ")}).`,
      "Anything wrong? Send the corrected listing as a new message.",
    ].join("\n"),
  );
}

async function askOrSave(s: Sender, l: Listing) {
  if (l.missing_fields.length) {
    await update(l.id, { draft_stage: "awaiting_answers" });
    await sendMessage(s.telegramId, questionMessage(l.missing_fields, "Got it. This listing doesn't mention a few things the group's minimums depend on:"));
    return;
  }
  await save(s, l);
}

export async function handleListingMessage(s: Sender, msg: TgMessage) {
  const text = (msg.text ?? msg.caption ?? "").trim();
  if (!text) {
    await sendMessage(s.telegramId, "I can only read text. Please resend the listing with its description as text (or as a photo caption).");
    return;
  }
  const draft = await myDraft(s);
  if (draft) return handleAnswers(s, draft, text);
  if (text.length < 30) {
    await sendMessage(s.telegramId, "That's too short to be a listing. Forward or paste the full listing text.");
    return;
  }

  await sendMessage(s.telegramId, "Reading the listing…");
  const structured = await extractListing(text);
  const missing = missingHardFields(structured);
  const l = must(
    await db()
      .from("listings")
      .insert({
        raw_text: text,
        submitted_by_telegram_id: s.telegramId,
        submitted_by_name: s.name,
        structured,
        clarifications: {},
        missing_fields: missing,
        extraction_status: missing.length ? "needs_clarification" : "ok",
        status: "draft",
      })
      .select()
      .single(),
  ) as Listing;
  await askOrSave(s, l);
}

async function handleAnswers(s: Sender, l: Listing, text: string) {
  const { answers, problems } = parseClarification(text, l.missing_fields);
  const structured = { ...l.structured };
  const clarifications = { ...l.clarifications };
  for (const [f, a] of Object.entries(answers) as [HardField, { value: number | boolean | null }][]) {
    clarifications[f] = a.value;
    (structured as Record<string, unknown>)[f] = a.value;
  }
  const stillMissing = l.missing_fields.filter((f) => !(f in answers));
  const next = { ...l, structured, clarifications, missing_fields: stillMissing };
  await update(l.id, { structured, clarifications, missing_fields: stillMissing });

  if (stillMissing.length) {
    const intro = [
      problems.length ? problems.map((p) => `• ${p}`).join("\n") + "\n" : "",
      `I still need: ${stillMissing.map((f) => FIELD_LABEL[f]).join(", ")}. (Or send /cancel to discard this listing.)`,
    ].join("");
    await sendMessage(s.telegramId, questionMessage(stillMissing, intro));
    return;
  }
  await askOrSave(s, next);
}

export async function handleListingCommand(s: Sender, cmd: string) {
  if (cmd !== "/cancel") return false;
  const draft = await myDraft(s);
  if (!draft) {
    await sendMessage(s.telegramId, "Nothing to cancel.");
    return true;
  }
  must(await db().from("listings").delete().eq("id", draft.id).select("id"));
  await sendMessage(s.telegramId, "Discarded. Send another listing any time.");
  return true;
}
