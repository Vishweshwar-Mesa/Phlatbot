"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Reaction = "interested" | "maybe" | "no";

export default function VoteBox({ token, batchId, listingId, mine }: {
  token: string; batchId: string; listingId: string; mine: { reaction: Reaction; comment: string | null } | null;
}) {
  const router = useRouter();
  const [reaction, setReaction] = useState<Reaction | null>(mine?.reaction ?? null);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function cast(r: Reaction) {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/app/${token}/vote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ batchId, listingId, reaction: r, comment }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : { error: "Network problem. Please try again." };
    setBusy(false);
    if (!res?.ok) return setMsg(data.error ?? "Couldn't save your vote.");
    setReaction(r);
    setMsg("Saved. Only you can see it until the reveal.");
    router.refresh();
  }

  const id = `c-${listingId}`;
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Your vote {reaction && <span className="muted small">(you can change it until the reveal)</span>}</div>
      <div className="vote-btns">
        {(["interested", "maybe", "no"] as const).map((r) => (
          <button key={r} type="button" disabled={busy} className={`vbtn ${r}${reaction === r ? " on" : ""}`} onClick={() => cast(r)}>
            {r === "interested" ? "Interested" : r === "maybe" ? "Maybe" : "No"}
          </button>
        ))}
      </div>
      <input id={id} type="text" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)}
        placeholder="Optional short comment (saved with your vote)" aria-label="Comment" style={{ marginTop: 10 }} />
      {msg && <p className="small muted" style={{ marginBottom: 0 }}>{msg}</p>}
    </div>
  );
}
