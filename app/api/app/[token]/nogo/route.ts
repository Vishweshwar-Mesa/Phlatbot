import { db, must } from "@/lib/db";
import { participantByToken } from "@/lib/participants";
import { assess } from "@/lib/pipeline";
import type { Listing } from "@/lib/types";

export const maxDuration = 120;

// A person answers "is <locality> inside your no-go area <area>?". Unpublished listings are re-scored.
export async function POST(request: Request, ctx: RouteContext<"/api/app/[token]/nogo">) {
  const { token } = await ctx.params;
  const me = await participantByToken(token);
  if (!me) return Response.json({ error: "Unknown link." }, { status: 404 });
  const b = (await request.json().catch(() => ({}))) as { locality?: string; area?: string; isNoGo?: unknown };
  if (typeof b.locality !== "string" || typeof b.area !== "string" || typeof b.isNoGo !== "boolean") {
    return Response.json({ error: "Invalid answer." }, { status: 400 });
  }
  must(
    await db()
      .from("no_go_confirmations")
      .update({ is_no_go: b.isNoGo, answered_at: new Date().toISOString() })
      .eq("participant_id", me.id)
      .eq("normalized_locality", b.locality)
      .eq("no_go_area", b.area)
      .select("participant_id"),
  );
  const stale = must(await db().from("listings").select("*").eq("status", "assessed_unpublished")) as Listing[];
  if (stale.length) await assess(stale);
  return Response.json({ ok: true });
}
