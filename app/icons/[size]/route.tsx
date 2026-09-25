import { ImageResponse } from "next/og";

// App icons for the home-screen install (PWA): /icons/192, /icons/512.
export async function GET(_req: Request, ctx: RouteContext<"/icons/[size]">) {
  const { size: raw } = await ctx.params;
  const size = raw === "512" ? 512 : 192;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #b9b6f3 0%, #f4c9d6 100%)",
          color: "#2e2c4d",
          fontSize: size * 0.56,
          fontWeight: 800,
        }}
      >
        ⌂
      </div>
    ),
    { width: size, height: size },
  );
}
