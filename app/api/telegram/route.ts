import { timingSafeEqual } from "node:crypto";
import { handleUpdate } from "@/lib/bot";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendMessage, type TgUpdate } from "@/lib/telegram";

export const maxDuration = 60;

function secretOk(header: string | null): boolean {
  const expected = Buffer.from(env("TELEGRAM_WEBHOOK_SECRET"));
  const got = Buffer.from(header ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export async function POST(request: Request) {
  if (!secretOk(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return new Response("forbidden", { status: 403 });
  }

  const update = (await request.json()) as TgUpdate;
  if (typeof update.update_id !== "number") return new Response("ok");

  // Idempotency: Telegram re-delivers on timeouts; process each update_id once.
  const { data: fresh, error } = await db().rpc("claim_telegram_update", {
    p_update_id: update.update_id,
  });
  if (error) return new Response("db error", { status: 500 }); // let Telegram retry
  if (!fresh) return new Response("ok");

  try {
    await handleUpdate(update);
  } catch (err) {
    console.error("telegram update failed", update.update_id, err);
    const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
    const isDm = (update.message?.chat.type ?? update.callback_query?.message?.chat.type) === "private";
    if (chatId && isDm) {
      await sendMessage(chatId, "Sorry, something went wrong handling that. Please try again.").catch(
        () => undefined,
      );
    }
  }
  // Always 200 once claimed: the user has been told if it failed, and a retry would be a duplicate.
  return new Response("ok");
}
