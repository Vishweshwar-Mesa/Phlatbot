import "server-only";
import { createHash } from "node:crypto";
import { FIELD_LABEL, missingHardFields, parseClarification, questionMessage } from "../clarify";
import { db, must } from "../db";
import { extractListing } from "../extract";
import { readiness } from "../participants";
import { answerCallback, clearButtons, sendMessage, TgCallbackQuery, TgMessage } from "../telegram";
import type { HardField, Listing, ListingStructured, Participant } from "../types";

// Listing submission: extract -> ask about missing hard-constraint fields (one message)
// -> summary with Yes/Edit -> on Yes, dedupe by hash of the confirmed text -> into the pool.

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const yn = (v: boolean | null) => (v === null ? "not confirmed" : v ? "yes" : "no");
const val = <T,>(v: T | null, f: (x: T) => string = String) => (v === null ? "not confirmed" : f(v));

export function dedupeHash(text: string): string {
  const norm = text.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(norm).digest("hex");
}

export function summary(s: ListingStructured, clar: Listing["clarifications"]): string {
  const src = (f: HardField) => (f in clar ? (clar[f] === null ? " (you didn't know)" : " (from you)") : "");
  const lines = [
    "Here's what I read. Please check it:",
    "",
    `📍 ${val(s.normalized_locality)}${s.location && s.location !== s.normalized_locality ? ` (${s.location})` : ""}`,
    `💰 Rent: ${val(s.monthly_rent, inr)}${s.monthly_rent !== null ? ` (${inr(s.monthly_rent / 3)} each)` : ""}${src("monthly_rent")}`,
    `🔐 Deposit: ${val(s.security_deposit, inr)} · Brokerage: ${val(s.brokerage)}`,
    `🛁 Bathrooms: ${val(s.bathrooms)}${src("bathrooms")} · Floor: ${val(s.floor)}`,
    `🛗 Lift: ${yn(s.has_lift)}${src("has_lift")} · 🚗 Parking: ${yn(s.has_parking)}${src("has_parking")}`,
    `🐾 Pets: ${yn(s.pet_friendly)}${src("pet_friendly")} · 🔑 Bachelors: ${yn(s.bachelor_friendly)}${src("bachelor_friendly")}`,
    `🛋 Furnishing: ${val(s.furnishing)} · Available: ${val(s.available_from)}`,
    s.other_notes ? `📝 ${s.other_notes}` : null,
    "",
    "Is this right? Yes adds it to the pool. Edit lets you resend the full text.",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

async function myDraft(me: Participant): Promise<Listing | null> {
  const rows = must(
    await db()
      .from("listings")
      .select("*")
      .eq("submitted_by_telegram_id", me.telegram_user_id!)
      .eq("status", "draft")
      .order("submitted_at", { ascending: false })
      .limit(1),
  ) as Listing[];
  return rows[0] ?? null;
}

async function update(id: string, patch: Partial<Listing>) {
  must(await db().from("listings").update(patch).eq("id", id).select("id"));
}

async function askOrConfirm(me: Participant, l: Listing) {
  const chat = me.telegram_user_id!;
  if (l.missing_fields.length) {
    await update(l.id, { draft_stage: "awaiting_answers" });
    await sendMessage(chat, questionMessage(l.missing_fields, "This listing doesn't mention a few things your group's minimums depend on:"));
    return;
  }
  await update(l.id, { draft_stage: "awaiting_confirm" });
  await sendMessage(chat, summary(l.structured, l.clarifications), [
    [
      { text: "✅ Yes, add it", callback_data: `yes:${l.id}` },
      { text: "✏️ Edit", callback_data: `edit:${l.id}` },
    ],
  ]);
}

async function extractInto(me: Participant, text: string, existing: Listing | null) {
  await sendMessage(me.telegram_user_id!, "Reading the listing…");
  const structured = await extractListing(text);
  const missing = missingHardFields(structured);
  const patch = {
    raw_text: text,
    structured,
    clarifications: {},
    missing_fields: missing,
    extraction_status: missing.length ? "needs_clarification" : "ok",
    submitted_at: new Date().toISOString(),
  } as const;
  let l: Listing;
  if (existing) {
    await update(existing.id, patch);
    l = { ...existing, ...patch };
  } else {
    l = must(
      await db()
        .from("listings")
        .insert({ ...patch, submitted_by_telegram_id: me.telegram_user_id, status: "draft" })
        .select()
        .single(),
    ) as Listing;
  }
  await askOrConfirm(me, l);
}

export async function handleListingMessage(me: Participant, msg: TgMessage) {
  const text = (msg.text ?? msg.caption ?? "").trim();
  const draft = await myDraft(me);

  if (!text) {
    await sendMessage(
      me.telegram_user_id!,
      "I can only read text. Please resend the listing with its description as text (or as a photo caption).",
    );
    return;
  }

  if (draft?.draft_stage === "awaiting_answers") return handleAnswers(me, draft, text);
  if (draft?.draft_stage === "awaiting_edit") return extractInto(me, text, draft);
  if (draft?.draft_stage === "awaiting_confirm") {
    await sendMessage(
      me.telegram_user_id!,
      "You have a listing waiting for confirmation. Tap Yes or Edit on it above, or send /cancel to discard it.",
    );
    return;
  }
  if (text.length < 30) {
    await sendMessage(me.telegram_user_id!, "That's too short to be a listing. Forward or paste the full listing text.");
    return;
  }
  await extractInto(me, text, null);
}

async function handleAnswers(me: Participant, l: Listing, text: string) {
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
      `Thanks. I still need: ${stillMissing.map((f) => FIELD_LABEL[f]).join(", ")}.`,
    ].join("");
    await sendMessage(me.telegram_user_id!, questionMessage(stillMissing, intro));
    return;
  }
  await askOrConfirm(me, next);
}

export async function handleListingCommand(me: Participant, _msg: TgMessage, cmd: string) {
  if (cmd !== "/cancel") return false;
  const draft = await myDraft(me);
  if (!draft) {
    await sendMessage(me.telegram_user_id!, "You don't have an unconfirmed listing.");
    return true;
  }
  must(await db().from("listings").delete().eq("id", draft.id).select("id"));
  await sendMessage(me.telegram_user_id!, "Discarded. Forward another listing any time.");
  return true;
}

export async function handleListingCallback(me: Participant, q: TgCallbackQuery) {
  const [action, id] = (q.data ?? "").split(":");
  const rows = must(
    await db().from("listings").select("*").eq("id", id).eq("submitted_by_telegram_id", me.telegram_user_id!).limit(1),
  ) as Listing[];
  const l = rows[0];
  if (q.message) await clearButtons(q.message.chat.id, q.message.message_id);
  if (!l || l.status !== "draft" || l.draft_stage !== "awaiting_confirm") {
    await answerCallback(q.id, "That listing was already handled.");
    return;
  }
  await answerCallback(q.id);
  const chat = me.telegram_user_id!;

  if (action === "edit") {
    await update(l.id, { draft_stage: "awaiting_edit" });
    await sendMessage(chat, "OK. Send the corrected listing as one full message and I'll read it again.");
    return;
  }
  if (action !== "yes") return;

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
    await sendMessage(chat, "This listing is already in the pool (same text), so I didn't add it again.");
    return;
  }
  must(res);
  await sendMessage(
    chat,
    ready
      ? "Added to the pool ✅ It'll be assessed for the next shortlist (7:05pm; listings after 6pm roll to tomorrow)."
      : `Added to the pool ✅ It'll be matched once everyone's constraints are in (waiting on ${waiting.map((w) => w.name).join(", ")}).`,
  );
}
