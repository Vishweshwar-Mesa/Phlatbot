import "server-only";
import { db, must } from "../db";
import { BOT_USERNAME, tokenFromConnectCode } from "../links";
import { participantByTelegram, participantByToken } from "../participants";
import { answerCallback, sendMessage, TgCallbackQuery, TgMessage, TgUpdate } from "../telegram";
import type { Participant } from "../types";

// Telegram is only for listings: submitting them and answering questions about them.
// Everything else (constraints, status, shortlist, votes) lives in the web app.

export async function handleUpdate(update: TgUpdate): Promise<void> {
  if (update.message) return handleMessage(update.message);
  if (update.callback_query) return handleCallback(update.callback_query);
}

function command(text: string | undefined): { cmd: string; arg: string } | null {
  if (!text?.startsWith("/")) return null;
  const [head, ...rest] = text.trim().split(/\s+/);
  return { cmd: head.split("@")[0].toLowerCase(), arg: rest.join(" ").trim() };
}

async function handleMessage(msg: TgMessage): Promise<void> {
  const from = msg.from;
  // The bot never reads groups; everything happens in a private chat.
  if (!from || msg.chat.type !== "private") return;

  const cmd = command(msg.text);
  if (cmd?.cmd === "/start" && cmd.arg) return connect(msg, cmd.arg);

  const me = await participantByTelegram(from.id);
  // Unknown senders are ignored entirely: no reply, nothing stored.
  if (!me) return;

  if (cmd) {
    if (cmd.cmd === "/start" || cmd.cmd === "/help") return sendHelp(me);
    const { handleListingCommand } = await import("./listing");
    if (await handleListingCommand(me, msg, cmd.cmd)) return;
    return sendHelp(me);
  }

  const { handleListingMessage } = await import("./listing");
  return handleListingMessage(me, msg);
}

/** One-tap link from the app's "Connect Telegram" button: t.me/<bot>?start=<code>. */
async function connect(msg: TgMessage, code: string) {
  const token = tokenFromConnectCode(code);
  const p = token ? await participantByToken(token) : null;
  if (!p) return; // not a valid code: behave like any unknown sender

  const tgId = msg.from!.id;
  if (p.telegram_user_id === tgId) {
    await sendMessage(tgId, `You're already connected as ${p.name}. Forward or paste a listing any time.`);
    return;
  }
  if (p.telegram_user_id !== null) {
    await sendMessage(tgId, `${p.name}'s app is already connected to a different Telegram account.`);
    return;
  }
  const already = await participantByTelegram(tgId);
  if (already) {
    await sendMessage(tgId, `This Telegram account is already connected as ${already.name}.`);
    return;
  }
  // Conditional update so a second account can't race in.
  const linked = must(
    await db().from("participants").update({ telegram_user_id: tgId }).eq("id", p.id).is("telegram_user_id", null).select(),
  ) as Participant[];
  if (linked.length === 0) {
    await sendMessage(tgId, `${p.name}'s app was just connected to another account.`);
    return;
  }
  await sendMessage(
    tgId,
    [
      `Connected ✅ You're ${p.name}.`,
      "",
      "Whenever you find a flat, forward the listing here or paste its text. I'll read it, ask about anything it " +
        "doesn't say, and show you a summary to confirm before it goes into the pool.",
      "",
      "Everything else (your constraints, the shortlist and voting) is in your Phlatmatch app.",
    ].join("\n"),
  );
}

async function sendHelp(me: Participant) {
  await sendMessage(
    me.telegram_user_id!,
    [
      `Hi ${me.name}! I only handle listings:`,
      "• Forward or paste a listing here to add it",
      "• I'll ask about anything it doesn't mention, then show a summary to confirm",
      "• /cancel discards a listing you haven't confirmed yet",
      "",
      `Your constraints, the shortlist and voting are in your Phlatmatch app. @${BOT_USERNAME} never picks a flat for you.`,
    ].join("\n"),
  );
}

async function handleCallback(q: TgCallbackQuery): Promise<void> {
  const me = await participantByTelegram(q.from.id);
  if (!me) {
    await answerCallback(q.id);
    return;
  }
  const { handleListingCallback } = await import("./listing");
  await handleListingCallback(me, q);
}
