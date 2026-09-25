import { approvalFor } from "@/lib/approval";
import { checkCustomFactorRelevance } from "@/lib/gemini";
import { participantByToken } from "@/lib/participants";
import { MAX_LABEL_LENGTH, normalizeLabel, STARTER_FACTORS } from "@/lib/softFactors";

// Live relevance check for a suggested custom factor (classification only, never scoring).
export async function POST(request: Request, ctx: RouteContext<"/api/form/[token]/relevance">) {
  const { token } = await ctx.params;
  const me = await participantByToken(token);
  if (!me) return Response.json({ error: "Unknown form link." }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { label?: unknown };
  const label = typeof body.label === "string" ? normalizeLabel(body.label) : "";
  if (!label || label.length > MAX_LABEL_LENGTH) {
    return Response.json({ error: `Enter a factor of 1–${MAX_LABEL_LENGTH} characters.` }, { status: 400 });
  }
  if (STARTER_FACTORS.some((s) => s.toLowerCase() === label.toLowerCase())) {
    return Response.json({ error: `"${label}" is already in the list above. Use its slider.` }, { status: 400 });
  }

  try {
    const { verdict, reason } = await checkCustomFactorRelevance(label);
    return Response.json({
      label,
      verdict,
      reason,
      approval: verdict === "RELEVANT" ? approvalFor(me.id, label) : null,
    });
  } catch (err) {
    console.error("relevance check failed", err);
    // Never accept a factor unchecked: tell the person and let them retry.
    return Response.json(
      { error: "Couldn't run the relevance check just now. Please try again in a moment." },
      { status: 502 },
    );
  }
}
