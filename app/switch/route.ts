import { cookies } from "next/headers";

// "Not you?" -> forget the remembered person on this device.
export async function GET(request: Request) {
  (await cookies()).delete("pm_me");
  return Response.redirect(new URL("/?pick=1", request.url), 303);
}
