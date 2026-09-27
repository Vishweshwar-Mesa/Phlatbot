import "server-only";
import { db, must } from "./db";
import type { Listing } from "./types";

// Approximate coordinates for a locality via OpenStreetMap Nominatim (free, no key).
// Cached per normalized_locality; at most one request per second; failures just mean "no pin".

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function lookup(locality: string): Promise<{ lat: number; lng: number } | null> {
  const q = encodeURIComponent(`${locality}, Pune, Maharashtra, India`);
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
      headers: { "User-Agent": "Phlatmatch/1.0 (small private flat-search tool)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as { lat: string; lon: string }[];
    if (!rows[0]) return null;
    const lat = Number(rows[0].lat), lng = Number(rows[0].lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

export async function geocodeListings(listings: Listing[]): Promise<void> {
  const todo = listings.filter((l) => l.structured.normalized_locality && l.structured.latitude == null);
  if (!todo.length) return;
  const keys = [...new Set(todo.map((l) => l.structured.normalized_locality!.toLowerCase().trim()))];
  const cached = must(
    await db().from("locality_geocode_cache").select("*").in("normalized_locality", keys),
  ) as { normalized_locality: string; latitude: number | null; longitude: number | null }[];
  const coords = new Map(cached.map((c) => [c.normalized_locality, c]));

  let first = true;
  for (const k of keys) {
    if (coords.has(k)) continue;
    if (!first) await sleep(1100); // Nominatim usage policy: max 1 request/second
    first = false;
    const hit = await lookup(k);
    const row = { normalized_locality: k, latitude: hit?.lat ?? null, longitude: hit?.lng ?? null, resolved_at: new Date().toISOString() };
    await db().from("locality_geocode_cache").upsert(row);
    coords.set(k, row);
  }

  for (const l of todo) {
    const c = coords.get(l.structured.normalized_locality!.toLowerCase().trim());
    if (!c || c.latitude === null) continue;
    await db()
      .from("listings")
      .update({ structured: { ...l.structured, latitude: c.latitude, longitude: c.longitude } })
      .eq("id", l.id);
  }
}
