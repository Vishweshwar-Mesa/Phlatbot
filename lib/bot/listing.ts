import "server-only";
import { answerCallback, sendMessage, TgCallbackQuery, TgMessage } from "../telegram";
import type { Participant } from "../types";

// Listing ingestion lands in the next stage; for now the bot says so honestly.

export async function handleListingCommand(_me: Participant, _msg: TgMessage, _cmd: string) {
  return false;
}

export async function handleListingMessage(me: Participant, _msg: TgMessage) {
  await sendMessage(me.telegram_user_id!, "Listing submission isn't switched on yet. Coming in the next build stage.");
}

export async function handleListingCallback(_me: Participant, q: TgCallbackQuery) {
  await answerCallback(q.id);
}
