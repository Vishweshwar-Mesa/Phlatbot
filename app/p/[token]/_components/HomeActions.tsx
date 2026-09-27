"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

async function post(url: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, string> }> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) }).catch(() => null);
  return { ok: !!res?.ok, data: res ? await res.json().catch(() => ({})) : { error: "Network problem. Please try again." } };
}

/** "Is <locality> inside your no-go area <area>?" The person decides; the app never does. */
export function NoGoQuestion({ token, locality, area }: { token: string; locality: string; area: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function answer(isNoGo: boolean) {
    setBusy(true);
    const r = await post(`/api/app/${token}/nogo`, { locality, area, isNoGo });
    setBusy(false);
    if (!r.ok) return setErr(r.data.error ?? "Couldn't save your answer.");
    router.refresh();
  }
  return (
    <div className="card inset" style={{ marginBottom: 10 }}>
      <p style={{ margin: "0 0 10px" }}>
        A listing is in <strong>{locality}</strong>. That loosely matches your no-go area <strong>&quot;{area}&quot;</strong>. Is it a no-go?
      </p>
      <div className="row">
        <button type="button" disabled={busy} onClick={() => answer(true)}>Yes, it&apos;s a no-go</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => answer(false)}>No, that&apos;s fine</button>
      </div>
      {err && <p className="error small">{err}</p>}
    </div>
  );
}

/** Explicit pull: re-score everything unpublished and publish now (once an hour in total). */
export function PublishNow({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setMsg(null);
    const r = await post(`/api/app/${token}/reassess`);
    setBusy(false);
    if (!r.ok) return setMsg(r.data.error ?? "Couldn't publish.");
    router.push(`/p/${token}/shortlist?b=${r.data.batchRunId}`);
  }
  return (
    <>
      <button type="button" className="secondary" style={{ width: "100%" }} disabled={busy} onClick={run}>
        {busy ? "Scoring and publishing…" : "Publish a shortlist now"}
      </button>
      {msg && <p className="notice small" style={{ marginTop: 10 }}>{msg}</p>}
    </>
  );
}
