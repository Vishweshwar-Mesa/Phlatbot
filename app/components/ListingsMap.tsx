"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  label: string; // e.g. "₹54k"
  title: string; // locality
}

// OpenStreetMap tiles via Leaflet: free, no key. One pin per listing that has coordinates.
export default function ListingsMap({ pins, selected, onSelect, height = 420 }: {
  pins: MapPin[];
  selected?: string | null;
  onSelect?: (id: string) => void;
  height?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const layer = useRef<import("leaflet").LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !el.current) return;
      if (!map.current) {
        map.current = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([18.5204, 73.8567], 12);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map.current);
      }
      layer.current?.remove();
      layer.current = L.layerGroup().addTo(map.current);
      for (const p of pins) {
        const icon = L.divIcon({
          className: "",
          html: `<div class="map-pin${p.id === selected ? " sel" : ""}">${p.label}</div>`,
          iconSize: [60, 28],
          iconAnchor: [30, 28],
        });
        L.marker([p.lat, p.lng], { icon, title: p.title }).on("click", () => onSelect?.(p.id)).addTo(layer.current);
      }
      if (pins.length && !selected) {
        map.current.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number])).pad(0.3), { maxZoom: 14 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pins, selected, onSelect]);

  useEffect(() => () => {
    map.current?.remove();
    map.current = null;
  }, []);

  return <div ref={el} className="leaflet-box" style={{ height }} role="region" aria-label="Map of listings" />;
}
