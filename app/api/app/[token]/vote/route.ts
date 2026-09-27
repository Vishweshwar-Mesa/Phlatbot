import { db, must } from "@/lib/db";
import { participantByToken } from "@/lib/participants";
import { batchById, batchVotes, isRevealed, type Reaction } from "@/lib/votes";

const REACTIONS: Reaction[] = ["interested", "maybe", "no"];

// Cast or change a vote. Allowed only on a shortlisted listing and only until it's revealed.
export async function POST(request: Request, ctx: RouteContext<"/api/app/[token]/vote">) {
  const { token } = await ctx.params;
  const me = await participantByToken(token);
  if (!me) return Response.json({ error: "Unknown link." }, { status: 404 });
  const b = (await request.json().catch(() => ({}))) as { batchId?: string; listingId?: string; reaction?: string; comment?: unknown };
  const batch = b.batchId ? await batchById(b.batchId) : null;
  if (!batch || !b.listingId || !batch.shortlist.includes(b.listingId)) {
    return Response.json({ error: "That listing isn't on this shortlist." }, { status: 400 });
  }
  if (!REACTIONS.includes(b.reaction as Reaction)) return Response.json({ error: "Pick interested, maybe or no." }, { status: 400 });
  const comment = typeof b.comment === "string" && b.comment.trim() ? b.comment.trim().slice(0, 500) : null;

  const votes = (await batchVotes(batch.id)).filter((v) => v.listing_id === b.listingId);
  if (isRevealed(batch, votes).revealed) return Response.json({ error: "Votes on this flat are already revealed." }, { status: 409 });

  must(
    await db()
      .from("votes")
      .upsert(
        { listing_id: b.listingId, batch_run_id: batch.id, participant_id: me.id, reaction: b.reaction, comment, updated_at: new Date().toISOString() },
        { onConflict: "listing_id,batch_run_id,participant_id" },
      )
      .select("id"),
  );
  return Response.json({ ok: true });
}
