import { bearerOk } from "@/lib/auth";
import { publish } from "@/lib/pipeline";

export const maxDuration = 300;

// Vercel Cron (vercel.json, 13:35 UTC = 7:05pm IST). Vercel sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request) {
  if (!bearerOk(request)) return new Response("unauthorized", { status: 401 });
  const result = await publish("cron");
  return Response.json(result);
}
