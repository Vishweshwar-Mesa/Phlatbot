import "server-only";
import { env } from "./env";

// Minimal Telegram Bot API client (webhook mode).

export interface TgUser {
  id: number;
  first_name?: string;
}
export interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}
export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
  caption?: string;
  photo?: unknown[];
  forward_origin?: unknown;
}
export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

export type InlineKeyboard = { text: string; callback_data: string }[][];

async function call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description}`);
  return json.result;
}

/** Telegram caps messages at 4096 chars; split on paragraph boundaries. */
function chunks(text: string, max = 4000): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let cur = "";
  for (const para of text.split("\n")) {
    if ((cur + "\n" + para).length > max && cur) {
      out.push(cur);
      cur = para;
    } else cur = cur ? cur + "\n" + para : para;
  }
  if (cur) out.push(cur);
  return out;
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  const parts = chunks(text);
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;
    await call("sendMessage", {
      chat_id: chatId,
      text: parts[i],
      link_preview_options: { is_disabled: true },
      ...(last && keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    });
  }
}

export async function answerCallback(id: string, text?: string): Promise<void> {
  await call("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
}

/** Removes the inline buttons from a message so a choice can't be tapped twice. */
export async function clearButtons(chatId: number, messageId: number): Promise<void> {
  await call("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [] },
  }).catch(() => undefined);
}
