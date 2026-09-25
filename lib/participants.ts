import "server-only";
import { db, must } from "./db";
import type { Participant, Preferences } from "./types";

export async function allParticipants(): Promise<Participant[]> {
  return must(await db().from("participants").select("*").order("name"));
}

export async function participantByTelegram(tgId: number): Promise<Participant | null> {
  const rows = must(
    await db().from("participants").select("*").eq("telegram_user_id", tgId).limit(1),
  ) as Participant[];
  return rows[0] ?? null;
}

export async function participantByToken(token: string): Promise<Participant | null> {
  // form_token is a uuid column; reject malformed tokens before querying.
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const rows = must(
    await db().from("participants").select("*").eq("form_token", token).limit(1),
  ) as Participant[];
  return rows[0] ?? null;
}

export async function allPreferences(): Promise<Preferences[]> {
  return must(await db().from("preferences").select("*"));
}

/** The readiness gate: true only when all three have submitted the form. */
export async function readiness(): Promise<{ ready: boolean; done: Participant[]; waiting: Participant[] }> {
  const ps = await allParticipants();
  const done = ps.filter((p) => p.form_submitted_at);
  const waiting = ps.filter((p) => !p.form_submitted_at);
  return { ready: ps.length > 0 && waiting.length === 0, done, waiting };
}

export function namesList(ps: { name: string }[]): string {
  const n = ps.map((p) => p.name);
  if (n.length <= 1) return n.join("");
  return n.slice(0, -1).join(", ") + " and " + n[n.length - 1];
}
