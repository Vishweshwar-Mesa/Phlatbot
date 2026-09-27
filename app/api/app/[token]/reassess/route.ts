import { participantByToken } from "@/lib/participants";
import { reassessNow } from "@/lib/pipeline";
import { formatIst } from "@/lib/time";

export const maxDuration = 300;

// "Publish now": re-scores unpublished listings from their cached extraction and publishes immediately.
export async function POST(_req: Request, ctx: RouteContext<"/api/app/[token]/reassess">) {
  const { token } = await ctx.params;
  if (!(await participantByToken(token))) return Response.json({ error: "Unknown link." }, { status: 404 });
  const r = await reassessNow();
  if (!r.ok) return Response.json({ error: `Publish now can run once an hour. Try again after ${formatIst(r.retryAt)}.` }, { status: 429 });
  return Response.json({ batchRunId: r.batchRunId });
}
