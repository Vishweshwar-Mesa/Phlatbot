import "server-only";
import { db, must } from "../db";
import { appUrl } from "../env";
import {
  allParticipants,
  namesList,
  participantByTelegram,
  readiness,
} from "../participants";
import { answerCallback, sendMessage, TgCallbackQuery, TgMessage, TgUpdate } from "../telegram";
import type { Participant } from "../types";

/** Entry point for one (already de-duplicated) Telegram update. */
export async function handleUpdate(update: TgUpdate): Promise<void> {
  if (update.message) return handleMessage(update.message);
  if (update.callback_query) return handleCallback(update.callback_query);
}

function command(text: string | undefined): { cmd: string; arg: string } | null {
  if (!text?.startsWith("/")) return null;
  const [head, ...rest] = text.trim().split(/\s+/);
  // Strip the "@BotName" suffix Telegram adds in groups.
  return { cmd: head.split("@")[0].toLowerCase(), arg: rest.join(" ").trim() };
}

async function handleMessage(msg: TgMessage): Promise<void> {
  const from = msg.from;
  if (!from) return;
  const me = await participantByTelegram(from.id);
  const cmd = command(msg.text);

  // Groups: the bot never reads group chatter. The only group action is an explicit
  // /chatid from a known participant, used once to configure TELEGRAM_GROUP_CHAT_ID.
  if (msg.chat.type !== "private") {
    if (me && cmd?.cmd === "/chatid") {
      await sendMessage(msg.chat.id, `This group's chat id is: ${msg.chat.id}`);
    }
    return;
  }

  // Unlinked senders can only claim one of the three seeded identities.
  if (!me) return handleUnlinked(msg, cmd);

  if (cmd) {
    switch (cmd.cmd) {
      case "/start":
        return sendFormLink(me, true);
      case "/form":
        return sendFormLink(me, false);
      case "/status":
        return sendStatus(me);
      case "/help":
        return sendHelp(me);
      default: {
        const { handleListingCommand } = await import("./listing");
        if (await handleListingCommand(me, msg, cmd.cmd)) return;
        return sendHelp(me);
      }
    }
  }

  const { handleListingMessage } = await import("./listing");
  return handleListingMessage(me, msg);
}

async function handleUnlinked(msg: TgMessage, cmd: { cmd: string; arg: string } | null) {
  const ps = await allParticipants();
  const unclaimed = ps.filter((p) => p.telegram_user_id === null);
  // Once all three are linked, strangers get no response at all.
  if (unclaimed.length === 0) return;

  const typed = cmd?.cmd === "/start" ? cmd.arg : cmd ? "" : (msg.text ?? "").trim();
  if (!typed) {
    if (cmd?.cmd === "/start") {
      await sendMessage(
        msg.chat.id,
        `Hi! FlatMatch is set up for ${namesList(ps)}.\nWhich one are you? Reply with your name.`,
      );
    }
    return;
  }

  const match = ps.find((p) => p.name.toLowerCase() === typed.toLowerCase());
  if (!match) {
    await sendMessage(
      msg.chat.id,
      `"${typed}" isn't one of ${namesList(ps)}. Reply with your name exactly as listed.`,
    );
    return;
  }
  if (match.telegram_user_id !== null) {
    await sendMessage(
      msg.chat.id,
      `${match.name} is already linked to another Telegram account. If that's wrong, ask the others to check.`,
    );
    return;
  }
  // Conditional update so two accounts can't race for the same name.
  const linked = must(
    await db()
      .from("participants")
      .update({ telegram_user_id: msg.from!.id })
      .eq("id", match.id)
      .is("telegram_user_id", null)
      .select(),
  ) as Participant[];
  if (linked.length === 0) {
    await sendMessage(msg.chat.id, `${match.name} was just claimed by another account.`);
    return;
  }
  await sendFormLink(linked[0], true);
}

async function sendFormLink(p: Participant, welcome: boolean) {
  const url = appUrl(`/form/${p.form_token}`);
  const lines = [
    welcome ? `You're linked as ${p.name}. 👋` : null,
    p.form_submitted_at
      ? `Your constraints form (you can edit it any time):\n${url}`
      : `Please fill in your constraints form. It's private to you:\n${url}`,
    welcome
      ? "\nTo add a listing, forward or paste it here. /status shows progress, /help lists commands."
      : null,
  ];
  await sendMessage(p.telegram_user_id!, lines.filter(Boolean).join("\n"));
}

async function sendStatus(me: Participant) {
  const { done, waiting, ready } = await readiness();
  const lines = [
    ready
      ? `3/3 forms done ✅ Matching is open.`
      : `${done.length}/3 forms done, waiting on ${namesList(waiting)}.`,
  ];
  const counts = must(await db().from("listings").select("status")) as { status: string }[];
  const by = (s: string) => counts.filter((c) => c.status === s).length;
  lines.push(
    "",
    `Listings: ${by("awaiting_preferences")} waiting for everyone's forms, ` +
      `${by("pending")} queued for the next digest, ` +
      `${by("assessed_unpublished")} assessed and ready for the next digest, ` +
      `${by("published")} published.`,
  );
  if (by("draft")) lines.push(`${by("draft")} draft(s) are still waiting for their submitter to confirm.`);
  await sendMessage(me.telegram_user_id!, lines.join("\n"));
}

async function sendHelp(me: Participant) {
  await sendMessage(
    me.telegram_user_id!,
    [
      "FlatMatch commands:",
      "• Forward or paste a listing here to add it",
      "• /status: who has filled in the form, and where listings stand",
      "• /form: your personal constraints form link",
      "• /reassess: re-score everything unpublished and publish it now (once per hour)",
      "• /cancel: discard your unconfirmed listing draft",
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
