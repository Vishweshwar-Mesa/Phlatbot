import { after } from "next/server";
import { approvalValid } from "@/lib/approval";
import { db, must } from "@/lib/db";
import { participantByToken, readiness } from "@/lib/participants";
import { onPreferencesSaved } from "@/lib/pipeline";
import { type FormPayload, validatePrefs } from "@/lib/prefsValidation";

export const maxDuration = 60;

export async function POST(request: Request, ctx: RouteContext<"/api/form/[token]">) {
  const { token } = await ctx.params;
  const me = await participantByToken(token);
  if (!me) return Response.json({ errors: ["Unknown form link."] }, { status: 404 });

  const body = (await request.json().catch(() => null)) as FormPayload | null;
  if (!body) return Response.json({ errors: ["Invalid form data."] }, { status: 400 });

  const result = validatePrefs(body, (label, approval) => approvalValid(me.id, label, approval));
  if (!result.ok) return Response.json({ errors: result.errors }, { status: 400 });

  must(
    await db()
      .from("preferences")
      .upsert({ participant_id: me.id, ...result.prefs, updated_at: new Date().toISOString() })
      .select(),
  );

  // Only the first save sets form_submitted_at; the conditional update also tells us
  // whether this request was that first submission (so the trigger fires once).
  const firstRows = must(
    await db()
      .from("participants")
      .update({ form_submitted_at: new Date().toISOString() })
      .eq("id", me.id)
      .is("form_submitted_at", null)
      .select("id"),
  ) as { id: string }[];
  const firstSubmission = firstRows.length > 0;

  const { done, waiting } = await readiness();

  // Kick off matching / re-scoring after the response (onboarding-complete trigger, or re-score on edit).
  after(() => onPreferencesSaved(me.id, firstSubmission));

  return Response.json({ ok: true, firstSubmission, done: done.length, waiting: waiting.map((w) => w.name) });
}
