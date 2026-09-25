import { env } from "@/lib/env";
import { bearerOk } from "@/lib/auth";

// One-off admin action: points the Telegram webhook at this deployment and registers
// the bot's command menu. Protected by CRON_SECRET.
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_BASE_URL/api/admin/setup-webhook"
// Optional ?bypass=<token> appends Vercel's deployment-protection bypass to the webhook URL.
export async function POST(request: Request) {
  if (!bearerOk(request)) return new Response("unauthorized", { status: 401 });

  const bypass = new URL(request.url).searchParams.get("bypass");
  const hook = new URL(env("APP_BASE_URL").replace(/\/+$/, "") + "/api/telegram");
  if (bypass) hook.searchParams.set("x-vercel-protection-bypass", bypass);

  const api = `https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}`;
  const post = (method: string, body: unknown) =>
    fetch(`${api}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());

  const webhook = await post("setWebhook", {
    url: hook.toString(),
    secret_token: env("TELEGRAM_WEBHOOK_SECRET"),
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  const commands = await post("setMyCommands", {
    commands: [
      { command: "start", description: "Link your Telegram and get your form" },
      { command: "status", description: "Who's done, and where listings stand" },
      { command: "form", description: "Your personal constraints form link" },
      { command: "reassess", description: "Re-score and publish now (once/hour)" },
      { command: "cancel", description: "Discard your unconfirmed listing draft" },
      { command: "help", description: "How to use Phlatmatch" },
    ],
  });
  const info = await post("getWebhookInfo", {});
  return Response.json({ webhook, commands, info });
}
