import { participantByToken } from "@/lib/participants";

// Per-person web app manifest, so "Add to Home Screen" opens that person's own app.
export async function GET(_req: Request, ctx: RouteContext<"/p/[token]/manifest.webmanifest">) {
  const { token } = await ctx.params;
  const me = await participantByToken(token);
  if (!me) return new Response("not found", { status: 404 });
  return Response.json(
    {
      name: "Phlatmatch",
      short_name: "Phlatmatch",
      id: `/p/${token}`,
      start_url: `/p/${token}`,
      scope: `/p/${token}`,
      display: "standalone",
      background_color: "#f5f4fa",
      theme_color: "#dcdaf8",
      icons: [
        { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      ],
    },
    { headers: { "content-type": "application/manifest+json" } },
  );
}
