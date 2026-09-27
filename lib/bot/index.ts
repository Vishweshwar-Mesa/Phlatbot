import "server-only";
import { answerCallback, sendMessage, TgCallbackQuery, TgMessage, TgUpdate } from "../telegram";

// @Phlatbot only takes listings. Anyone who messages it privately can send one; it is
// structured, missing hard-constraint details are asked in one message, then it's saved.
// Everything else (constraints, listings, shortlist, votes) lives in the one shared web app.

export interface Sender {
  telegramId: number;
  name: string;
}

export async function handleUpdate(update: TgUpdate): Promise<void> {
  if (update.message) return handleMessage(update.message);
  if (update.callback_query) return handleCallback(update.callback_query);
}

async function handleMessage(msg: TgMessage): Promise<void> {
  // Never reads groups; only private chats.
  if (!msg.from || msg.chat.type !== "private") return;
  const sender: Sender = { telegramId: msg.from.id, name: msg.from.first_name?.trim() || "Someone" };
  const text = msg.text?.trim() ?? "";

  if (text.startsWith("/")) {
    const cmd = text.split(/\s+/)[0].split("@")[0].toLowerCase();
    const { handleListingCommand } = await import("./listing");
    if (await handleListingCommand(sender, cmd)) return;
    return sendHelp(sender);
  }
  const { handleListingMessage } = await import("./listing");
  return handleListingMessage(sender, msg);
}

async function sendHelp(s: Sender) {
  await sendMessage(
    s.telegramId,
    [
      `Hi ${s.name}! Forward or paste a flat listing here and I'll add it to Phlatmatch.`,
      "",
      "• I read the listing and ask, in one message, about anything it doesn't say that the group's minimums depend on",
      "• Then it's saved and shows up in the app",
      "• /cancel discards a listing I'm still asking about",
    ].join("\n"),
  );
}

async function handleCallback(q: TgCallbackQuery): Promise<void> {
  // No buttons are used any more; acknowledge old ones so Telegram stops spinning.
  await answerCallback(q.id, "Nothing to do here. Just send a listing.");
}
