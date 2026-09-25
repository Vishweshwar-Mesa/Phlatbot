import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "./env";

/** Checks `Authorization: Bearer <CRON_SECRET>` in constant time. */
export function bearerOk(request: Request): boolean {
  const expected = Buffer.from(`Bearer ${env("CRON_SECRET")}`);
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}
