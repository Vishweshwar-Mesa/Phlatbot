// Link helpers shared by pages and the bot.

export const BOT_USERNAME = "Phlatbot";

/** Telegram `start` payloads allow only [A-Za-z0-9_-] up to 64 chars; a uuid without dashes fits. */
export function telegramConnectCode(formToken: string): string {
  return formToken.replace(/-/g, "");
}

export function tokenFromConnectCode(code: string): string | null {
  if (!/^[0-9a-f]{32}$/i.test(code)) return null;
  const c = code.toLowerCase();
  return `${c.slice(0, 8)}-${c.slice(8, 12)}-${c.slice(12, 16)}-${c.slice(16, 20)}-${c.slice(20)}`;
}

export function telegramConnectUrl(formToken: string): string {
  return `https://t.me/${BOT_USERNAME}?start=${telegramConnectCode(formToken)}`;
}
