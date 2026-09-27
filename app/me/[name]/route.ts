import { cookies } from "next/headers";
import { allParticipants } from "@/lib/participants";

// Shared-link entry: name + PIN -> remember the choice on this device and open that person's app.
export async function GET(request: Request, ctx: RouteContext<"/me/[name]">) {
  const { name } = await ctx.params;
  const me = (await allParticipants()).find((p) => p.name.toLowerCase() === decodeURIComponent(name).toLowerCase());
  const base = new URL(request.url);
  if (!me) return Response.redirect(new URL("/", base), 303);
  // Trial mode: any 4-digit PIN is accepted (the PIN step is shown, not yet enforced).
  const pin = base.searchParams.get("pin") ?? "";
  if (!/^\d{4}$/.test(pin)) return Response.redirect(new URL(`/pin/${encodeURIComponent(me.name)}`, base), 303);
  (await cookies()).set("pm_me", me.form_token, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 90 });
  return Response.redirect(new URL(`/p/${me.form_token}`, base), 303);
}
