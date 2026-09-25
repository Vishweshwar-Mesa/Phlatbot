"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MAX_CUSTOM_FACTORS, MAX_LABEL_LENGTH, STARTER_FACTORS } from "@/lib/softFactors";

export interface InitialForm {
  max_rent: number;
  min_bathrooms: number;
  no_go_areas: string[];
  requires_lift: boolean;
  requires_parking: boolean;
  requires_pet_friendly: boolean;
  requires_bachelor_friendly: boolean;
  starter_weights: Record<string, number>;
  custom: CustomFactor[];
}

interface CustomFactor {
  label: string;
  weight: number;
  approval: string;
}

type BoolKey = "requires_lift" | "requires_parking" | "requires_pet_friendly" | "requires_bachelor_friendly";

const HARD_TOGGLES: { key: BoolKey; label: string; hint: string }[] = [
  { key: "requires_lift", label: "🛗 Lift", hint: "The building must have a lift" },
  { key: "requires_parking", label: "🚗 Parking", hint: "The flat must come with parking" },
  { key: "requires_pet_friendly", label: "🐾 Pet-friendly", hint: "The landlord must allow pets" },
  { key: "requires_bachelor_friendly", label: "🔑 Bachelor-friendly", hint: "The landlord must allow bachelors" },
];

const WEIGHT_WORDS = ["Don't care", "A little", "Somewhat", "Matters", "Matters a lot", "Top priority"];

function Slider({
  id,
  value,
  min,
  onChange,
}: {
  id: string;
  value: number;
  min: number;
  onChange: (v: number) => void;
}) {
  const fill = ((value - min) / (5 - min)) * 100;
  return (
    <>
      <input
        id={id}
        type="range"
        min={min}
        max={5}
        step={1}
        value={value}
        style={{ "--fill": `${fill}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="ticks" aria-hidden>
        {Array.from({ length: 6 - min }, (_, i) => (
          <span key={i}>{i + min}</span>
        ))}
      </div>
    </>
  );
}

export default function FormClient({ token, initial }: { token: string; initial: InitialForm | null }) {
  const router = useRouter();
  const [maxRent, setMaxRent] = useState(initial ? String(initial.max_rent) : "");
  const [minBaths, setMinBaths] = useState(initial ? String(initial.min_bathrooms) : "");
  const [noGo, setNoGo] = useState(initial ? initial.no_go_areas.join("\n") : "");
  // Hard toggles start unanswered on a first fill: the person must choose explicitly.
  const [bools, setBools] = useState<Record<BoolKey, boolean | null>>({
    requires_lift: initial?.requires_lift ?? null,
    requires_parking: initial?.requires_parking ?? null,
    requires_pet_friendly: initial?.requires_pet_friendly ?? null,
    requires_bachelor_friendly: initial?.requires_bachelor_friendly ?? null,
  });
  const [weights, setWeights] = useState<Record<string, number>>(
    Object.fromEntries(STARTER_FACTORS.map((f) => [f, initial?.starter_weights[f] ?? 0])),
  );
  const [custom, setCustom] = useState<CustomFactor[]>(initial?.custom ?? []);

  const [draftLabel, setDraftLabel] = useState("");
  const [draftWeight, setDraftWeight] = useState(3);
  const [checking, setChecking] = useState(false);
  const [rejection, setRejection] = useState<{ label: string; reason: string } | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(!!initial);

  async function checkFactor() {
    setRejection(null);
    setCheckError(null);
    const label = draftLabel.trim();
    if (!label) return;
    if (custom.some((c) => c.label.toLowerCase() === label.toLowerCase())) {
      setCheckError(`"${label}" is already added.`);
      return;
    }
    setChecking(true);
    try {
      const res = await fetch(`/api/form/${token}/relevance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCheckError(data.error ?? "Couldn't check that factor.");
      } else if (data.verdict === "RELEVANT") {
        setCustom((cs) => [...cs, { label: data.label, weight: draftWeight, approval: data.approval }]);
        setDraftLabel("");
        setDraftWeight(3);
      } else {
        // Not saved; show why, and leave the text in the box so they can edit it.
        setRejection({ label: data.label, reason: data.reason });
      }
    } catch {
      setCheckError("Network problem. Please try again.");
    } finally {
      setChecking(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    setSaved(null);
    if (draftLabel.trim()) {
      setErrors([
        `You typed a custom factor ("${draftLabel.trim()}") but didn't check it yet. Tap "Check & add" or clear the box.`,
      ]);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/form/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          max_rent: maxRent === "" ? null : Number(maxRent),
          min_bathrooms: minBaths === "" ? null : Number(minBaths),
          no_go_areas: noGo.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
          ...bools,
          starter_weights: weights,
          custom,
        }),
      });
      const data = await res.json();
      if (!res.ok) setErrors(data.errors ?? ["Couldn't save."]);
      else {
        setSubmitted(true);
        setSaved(
          data.waiting.length
            ? `Saved ✓ ${data.done}/3 done, waiting on ${data.waiting.join(", ")}.`
            : "Saved ✓ All three of you are done. Listings can now be matched.",
        );
        router.refresh();
      }
    } catch {
      setErrors(["Network problem. Your answers weren't saved. Please try again."]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <section className="card">
        <div className="section-head">
          <span className="section-icon">🔒</span>
          <div>
            <span className="eyebrow">Pass / fail</span>
            <h2>Hard minimums</h2>
            <p className="muted small" style={{ margin: 0 }}>
              Never weighted. A listing that fails one of these is out for you, and you&apos;ll see exactly why.
            </p>
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="rent">Max rent, your share</label>
            <div className="input-wrap">
              <span className="input-prefix">₹</span>
              <input
                id="rent"
                type="number"
                inputMode="numeric"
                min={1000}
                step={500}
                required
                value={maxRent}
                onChange={(e) => setMaxRent(e.target.value)}
                placeholder="18000"
              />
            </div>
            <div className="hint">Per month. Checked against the total rent ÷ 3.</div>
          </div>
          <div className="field">
            <label htmlFor="baths">Min. bathrooms</label>
            <input
              id="baths"
              type="number"
              inputMode="numeric"
              min={1}
              max={6}
              step={1}
              required
              value={minBaths}
              onChange={(e) => setMinBaths(e.target.value)}
              placeholder="2"
            />
            <div className="hint">For the whole flat.</div>
          </div>
        </div>

        <div className="field">
          <label htmlFor="nogo">No-go areas</label>
          <textarea
            id="nogo"
            value={noGo}
            onChange={(e) => setNoGo(e.target.value)}
            placeholder={"One per line, e.g.\nWhitefield\nElectronic City"}
          />
          <div className="hint">
            Optional. If a listing&apos;s area only loosely resembles one of these, the app asks you to confirm.
            It&apos;s never decided silently.
          </div>
        </div>

        <div style={{ marginTop: 6 }}>
          {HARD_TOGGLES.map(({ key, label, hint }) => (
            <div key={key} className={`toggle-row${bools[key] === null ? " unanswered" : ""}`} role="radiogroup" aria-label={label}>
              <div>
                <div className="t-label">{label}</div>
                <div className="t-hint">{hint}</div>
              </div>
              <div className="segmented">
                <label className={bools[key] === true ? "on" : ""}>
                  <input
                    type="radio"
                    name={key}
                    required
                    checked={bools[key] === true}
                    onChange={() => setBools((b) => ({ ...b, [key]: true }))}
                  />
                  Required
                </label>
                <label className={bools[key] === false ? "on off-choice" : ""}>
                  <input
                    type="radio"
                    name={key}
                    checked={bools[key] === false}
                    onChange={() => setBools((b) => ({ ...b, [key]: false }))}
                  />
                  Not needed
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <span className="section-icon">⭐</span>
          <div>
            <span className="eyebrow">Weighted 1–5</span>
            <h2>Preferences</h2>
            <p className="muted small" style={{ margin: 0 }}>
              How much does each matter to you? At 0 it&apos;s left out of your score. These only break ties between
              flats that pass everyone&apos;s minimums.
            </p>
          </div>
        </div>
        {STARTER_FACTORS.map((f) => (
          <div className="slider-row" key={f}>
            <div className="slider-top">
              <label className="s-label" htmlFor={`w-${f}`}>
                {f}
              </label>
              <span className={`badge w${weights[f]}`}>{WEIGHT_WORDS[weights[f]]}</span>
            </div>
            <Slider id={`w-${f}`} value={weights[f]} min={0} onChange={(v) => setWeights((w) => ({ ...w, [f]: v }))} />
          </div>
        ))}
      </section>

      <section className="card">
        <div className="section-head">
          <span className="section-icon">✨</span>
          <div>
            <span className="eyebrow">Optional</span>
            <h2>Your own factors</h2>
            <p className="muted small" style={{ margin: 0 }}>
              Anything missing above? Each one gets a quick check that it&apos;s really about the flat.
            </p>
          </div>
        </div>

        {custom.map((c, i) => (
          <div className="slider-row" key={c.label}>
            <div className="slider-top">
              <label className="s-label" htmlFor={`c-${i}`}>
                {c.label}
              </label>
              <span className="row" style={{ gap: 8 }}>
                <span className={`badge w${c.weight}`}>{WEIGHT_WORDS[c.weight]}</span>
                <button type="button" className="danger" onClick={() => setCustom((cs) => cs.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </span>
            </div>
            <Slider
              id={`c-${i}`}
              value={c.weight}
              min={1}
              onChange={(v) => setCustom((cs) => cs.map((x, j) => (j === i ? { ...x, weight: v } : x)))}
            />
          </div>
        ))}

        {custom.length < MAX_CUSTOM_FACTORS ? (
          <div className="card inset" style={{ marginTop: custom.length ? 12 : 0, marginBottom: 0 }}>
            <div className="field" style={{ marginTop: 0 }}>
              <label htmlFor="newf">Suggest a factor</label>
              <input
                id="newf"
                type="text"
                maxLength={MAX_LABEL_LENGTH}
                value={draftLabel}
                onChange={(e) => {
                  setDraftLabel(e.target.value);
                  setRejection(null);
                  setCheckError(null);
                }}
                placeholder="e.g. Gym in the building"
              />
            </div>
            <div className="slider-top">
              <span className="s-label">Importance</span>
              <span className={`badge w${draftWeight}`}>{WEIGHT_WORDS[draftWeight]}</span>
            </div>
            <Slider id="neww" value={draftWeight} min={1} onChange={setDraftWeight} />
            <button
              type="button"
              className="secondary"
              style={{ width: "100%", marginTop: 14 }}
              disabled={checking || !draftLabel.trim()}
              onClick={checkFactor}
            >
              {checking ? "Checking…" : "Check & add"}
            </button>
            {rejection && (
              <div className="notice small" role="alert" style={{ marginTop: 12 }}>
                <strong>&quot;{rejection.label}&quot; wasn&apos;t added.</strong> {rejection.reason}
                <br />
                Edit it and check again, or clear the box to drop it.
              </div>
            )}
            {checkError && (
              <p className="error small" style={{ marginBottom: 0 }}>
                {checkError}
              </p>
            )}
          </div>
        ) : (
          <p className="muted small">You&apos;ve added the maximum of {MAX_CUSTOM_FACTORS} custom factors.</p>
        )}
      </section>

      {errors.length > 0 && (
        <div className="notice" role="alert" style={{ marginBottom: 14 }}>
          <strong>Please fix:</strong>
          <ul className="tight">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {saved && (
        <p className="success" role="status">
          {saved}
        </p>
      )}

      <div className="action-bar">
        <div className="inner">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? "Saving…" : submitted ? "Update my constraints" : "Submit my constraints"}
          </button>
        </div>
      </div>
    </form>
  );
}
