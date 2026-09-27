"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import type { MapPin } from "@/app/components/ListingsMap";

const ListingsMap = dynamic(() => import("@/app/components/ListingsMap"), {
  ssr: false,
  loading: () => <div className="leaflet-box" style={{ height: 420, background: "var(--card-inset)" }} />,
});

export interface CardData {
  id: string;
  locality: string;
  rent: number | null;
  deposit: number | null;
  bathrooms: number | null;
  bedrooms: number | null;
  lift: boolean | null;
  parking: boolean | null;
  furnishing: string | null;
  floor: string | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  submitter: string | null;
  status: string;
  qualify: { name: string; state: "y" | "n" | "u" | "x" }[];
  qualifyCount: number | null;
}

const inr = (n: number | null) => (n == null ? "not confirmed" : "₹" + Math.round(n).toLocaleString("en-IN"));
const yn = (v: boolean | null, label: string) => (v === null ? `${label} ?` : v ? label : `No ${label.toLowerCase()}`);
const STATE_TITLE = { y: "qualifies", n: "disqualified", u: "qualifies, something not confirmed", x: "not scored yet" };
const FILTERS = ["All", "All 3 qualify", "Not scored yet"] as const;
function band(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `linear-gradient(135deg,hsl(${h} 55% 82%),hsl(${(h + 70) % 360} 60% 86%))`;
}

export default function ListingsClient({ cards }: { cards: CardData[] }) {
  const [mode, setMode] = useState<"list" | "map">("list");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [selected, setSelected] = useState<string | null>(null);

  const shown = useMemo(
    () =>
      cards.filter((c) =>
        filter === "All" ? true : filter === "All 3 qualify" ? c.qualifyCount === 3 : c.qualifyCount === null,
      ),
    [cards, filter],
  );
  const pins: MapPin[] = useMemo(
    () =>
      shown
        .filter((c) => c.lat !== null && c.lng !== null)
        .map((c) => ({ id: c.id, lat: c.lat!, lng: c.lng!, label: c.rent ? `₹${Math.round(c.rent / 1000)}k` : "₹?", title: c.locality })),
    [shown],
  );
  const onSelect = useCallback((id: string) => {
    setSelected(id);
    document.getElementById(`l-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);
  const sel = shown.find((c) => c.id === selected) ?? null;

  if (!cards.length) {
    return (
      <section className="card empty">
        <div className="big">📭</div>
        <h2>No listings yet</h2>
        <p className="muted small">Forward or paste a listing to @Phlatbot on Telegram. It appears here once you confirm it.</p>
      </section>
    );
  }

  const card = (c: CardData) => (
    <article id={`l-${c.id}`} key={c.id} className={`card lcard${c.id === selected ? " sel" : ""}`} onClick={() => setSelected(c.id)}>
      <div className="photo-band" style={{ background: band(c.id) }} aria-hidden />
      <div className="rent-line">
        <span className="big">{inr(c.rent)}</span>
        {c.rent !== null && <span className="muted small">/mo · {inr(c.rent / 3)} each</span>}
      </div>
      <div style={{ fontWeight: 600 }}>{c.locality}</div>
      <div className="facts">
        <span>🛏 {c.bedrooms ?? "?"} bed</span>
        <span>🛁 {c.bathrooms ?? "?"} bath</span>
        <span>🛗 {yn(c.lift, "Lift")}</span>
        <span>🚗 {yn(c.parking, "Parking")}</span>
        <span>🛋 {c.furnishing ?? "furnishing ?"}</span>
        <span>🔐 {inr(c.deposit)} deposit</span>
        {c.floor && <span>🏢 Floor {c.floor}</span>}
      </div>
      {c.notes && <p className="muted small" style={{ margin: "0 0 8px" }}>{c.notes}</p>}
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="dots">
          {c.qualify.map((q) => (
            <span key={q.name} className={`qdot ${q.state}`} title={`${q.name}: ${STATE_TITLE[q.state]}`}>
              {q.name[0]}
            </span>
          ))}
        </span>
        <span className="pill">{c.status}</span>
      </div>
      {c.submitter && <p className="hint" style={{ marginBottom: 0 }}>{c.submitter === "From the brief" ? "Listing described in the case brief" : c.submitter === "Sample data" ? "Sample listing (demo data)" : `Sent by ${c.submitter} on Telegram`}</p>}
    </article>
  );

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <div className="seg-switch" role="tablist" aria-label="View">
          {(["list", "map"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
              {m === "list" ? "▦ List" : "📍 Map"}
            </button>
          ))}
        </div>
        <div className="chip-list">
          {FILTERS.map((f) => (
            <button key={f} type="button" className={`pill${filter === f ? " accent" : ""}`} style={{ cursor: "pointer" }} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {mode === "map" ? (
        <section className="card" style={{ padding: 10 }}>
          <ListingsMap pins={pins} selected={selected} onSelect={onSelect} height={460} />
          <p className="hint" style={{ padding: "0 6px" }}>
            {pins.length} of {shown.length} listings have a pin, placed at the locality&apos;s approximate centre. Listings
            whose area couldn&apos;t be found have no pin. No commute times are calculated.
          </p>
          {sel ? <div className="map-card-sheet">{card(sel)}</div> : <p className="muted small" style={{ padding: "0 6px" }}>Tap a pin to see that flat.</p>}
        </section>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>{shown.map(card)}</div>
      )}
    </>
  );
}
