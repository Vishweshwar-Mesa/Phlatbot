// Server-only env access. Throws a clear error instead of silently defaulting.
import "server-only";

type EnvName =
  | "TELEGRAM_BOT_TOKEN"
  | "TELEGRAM_WEBHOOK_SECRET"
  | "TELEGRAM_GROUP_CHAT_ID"
  | "SUPABASE_URL"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "GEMINI_API_KEY"
  | "CRON_SECRET"
  | "APP_BASE_URL";

export function env(name: EnvName): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export function optionalEnv(name: EnvName): string | undefined {
  return process.env[name] || undefined;
}

export function appUrl(path: string): string {
  return env("APP_BASE_URL").replace(/\/+$/, "") + path;
}
