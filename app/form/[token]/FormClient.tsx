"use client";

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
  { key: "requires_lift", label: "Lift", hint: "The building must have a lift." },
  { key: "requires_parking", label: "Parking", hint: "The flat must come with parking." },
  { key: "requires_pet_friendly", label: "Pet-friendly", hint: "The landlord must allow pets." },
  { key: "requires_bachelor_friendly", label: "Bachelor-friendly", hint: "The landlord must allow bachelors/singles." },
];

const WEIGHT_WORDS = ["Don't care", "A little", "Somewhat", "Matters", "Matters a lot", "Top priority"];

export default function FormClient({ token, initial }: { token: string; initial: InitialForm | null }) {
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
        setSaved(
          data.waiting.length
            ? `Saved ✅ ${data.done}/3 done, waiting on ${data.waiting.join(", ")}.`
            : "Saved ✅ All three of you are done. Listings can now be matched.",
        );
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
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
        <h2 style={{ marginTop: 0 }}>Hard minimums</h2>
        <p className="muted small">
          Pass/fail only, never weighted. A listing that fails any of these is out for you, and you&apos;ll see
          exactly why.
        </p>

        <div className="field">
          <label htmlFor="rent">Max rent: your share, per month (₹)</label>
          <input
            id="rent"
            type="number"
            inputMode="numeric"
            min={1000}
            step={500}
            required
            value={maxRent}
            onChange={(e) => setMaxRent(e.target.value)}
            placeholder="e.g. 18000"
          />
          <div className="hint">Compared against the flat&apos;s total rent ÷ 3.</div>
        </div>

        <div className="field">
          <label htmlFor="baths">Minimum bathrooms in the flat</label>
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
            placeholder="e.g. 2"
          />
        </div>

        <div className="field">
          <label htmlFor="nogo">No-go areas</label>
          <textarea
            id="nogo"
            value={noGo}
            onChange={(e) => setNoGo(e.target.value)}
            placeholder={"One per line (or comma-separated), e.g.\nWhitefield\nElectronic City"}
          />
          <div className="hint">
            Leave empty if there are none. If a listing&apos;s locality only loosely resembles one of these,
            you&apos;ll be asked to confirm. It won&apos;t be decided silently.
          </div>
        </div>

        {HARD_TOGGLES.map(({ key, label, hint }) => (
          <fieldset key={key} className="field" style={{ border: 0, padding: 0, margin: "14px 0" }}>
            <legend style={{ fontWeight: 600 }}>{label}</legend>
            <div className="hint">{hint}</div>
            <div className="row">
              <label className="toggle">
                <input
                  type="radio"
                  name={key}
                  required
                  checked={bools[key] === true}
                  onChange={() => setBools((b) => ({ ...b, [key]: true }))}
                />
                Required
              </label>
              <label className="toggle">
                <input
                  type="radio"
                  name={key}
                  checked={bools[key] === false}
                  onChange={() => setBools((b) => ({ ...b, [key]: false }))}
                />
                Not required
              </label>
            </div>
          </fieldset>
        ))}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Preferences (weighted)</h2>
        <p className="muted small">
          How much does each one matter to you? 0 means you don&apos;t care, and it&apos;s left out of your score.
          These only break ties between flats that pass everyone&apos;s hard minimums.
        </p>
        {STARTER_FACTORS.map((f) => (
          <div className="field" key={f}>
            <label htmlFor={`w-${f}`}>
              {f}: <span className="muted">{weights[f]} · {WEIGHT_WORDS[weights[f]]}</span>
            </label>
            <input
              id={`w-${f}`}
              type="range"
              min={0}
              max={5}
              step={1}
              value={weights[f]}
              onChange={(e) => setWeights((w) => ({ ...w, [f]: Number(e.target.value) }))}
            />
          </div>
        ))}

        <h3>Your own factors</h3>
        {custom.length === 0 && <p className="muted small">None added.</p>}
        {custom.map((c, i) => (
          <div className="field" key={c.label}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <label htmlFor={`c-${i}`} style={{ margin: 0 }}>
                {c.label}: <span className="muted">{c.weight} · {WEIGHT_WORDS[c.weight]}</span>
              </label>
              <button
                type="button"
                className="danger"
                style={{ padding: "4px 10px" }}
                onClick={() => setCustom((cs) => cs.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </div>
            <input
              id={`c-${i}`}
              type="range"
              min={1}
              max={5}
              step={1}
              value={c.weight}
              onChange={(e) =>
                setCustom((cs) => cs.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))
              }
            />
          </div>
        ))}

        {custom.length < MAX_CUSTOM_FACTORS && (
          <div className="card" style={{ background: "#fafafa" }}>
            <div className="field" style={{ marginTop: 0 }}>
              <label htmlFor="newf">Suggest your own factor</label>
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
            <div className="field">
              <label htmlFor="neww">
                Importance: <span className="muted">{draftWeight} · {WEIGHT_WORDS[draftWeight]}</span>
              </label>
              <input
                id="neww"
                type="range"
                min={1}
                max={5}
                step={1}
                value={draftWeight}
                onChange={(e) => setDraftWeight(Number(e.target.value))}
              />
            </div>
            <button type="button" className="secondary" disabled={checking || !draftLabel.trim()} onClick={checkFactor}>
              {checking ? "Checking…" : "Check & add"}
            </button>
            <p className="hint small">Each custom factor gets a quick check that it&apos;s really about the flat before it&apos;s added.</p>
            {rejection && (
              <div className="notice small" role="alert">
                <strong>&quot;{rejection.label}&quot; wasn&apos;t added.</strong> {rejection.reason}
                <br />
                Edit it above and check again, or clear the box to drop it.
              </div>
            )}
            {checkError && <p className="error small">{checkError}</p>}
          </div>
        )}
      </section>

      {errors.length > 0 && (
        <div className="notice" role="alert">
          <strong>Please fix:</strong>
          <ul className="tight">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {saved && <p className="success">{saved}</p>}
      <button type="submit" disabled={saving} style={{ width: "100%", marginTop: 12 }}>
        {saving ? "Saving…" : initial ? "Update my constraints" : "Submit my constraints"}
      </button>
    </form>
  );
}
