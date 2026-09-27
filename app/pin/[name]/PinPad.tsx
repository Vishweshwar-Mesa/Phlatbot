"use client";

import { useState } from "react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

export default function PinPad({ name }: { name: string }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  function press(k: string) {
    if (busy) return;
    if (k === "⌫") return setPin((p) => p.slice(0, -1));
    const next = (pin + k).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      setBusy(true);
      window.location.assign(`/me/${encodeURIComponent(name)}?pin=${next}`);
    }
  }

  return (
    <section className="card" style={{ display: "grid", gap: 18 }}>
      <div className="pin-dots" aria-label={`${pin.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => <i key={i} className={i < pin.length ? "f" : ""} />)}
      </div>
      <div className="keypad">
        {KEYS.map((k, i) =>
          k ? (
            <button key={i} type="button" className="key" onClick={() => press(k)} aria-label={k === "⌫" ? "Delete" : k} disabled={busy}>
              {k}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
      {busy && <p className="muted small" style={{ textAlign: "center", margin: 0 }}>Opening your app…</p>}
    </section>
  );
}
