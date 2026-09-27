import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/app/components/PageHeader";
import { db, must } from "@/lib/db";
import { allParticipants, participantByToken } from "@/lib/participants";
import { formatIst } from "@/lib/time";
import { inr, listingViews, type ListingView } from "@/lib/views";
import { batchById, batchVotes, isRevealed, latestPublishedBatch, type BatchRun, type VoteRow } from "@/lib/votes";
import VoteBox from "./VoteBox";

export const dynamic = "force-dynamic";

const OUTCOME = { matched: "hit", not_matched: "miss", no_data: "nod" } as const;

export default async function Shortlist({ params, searchParams }: PageProps<"/p/[token]/shortlist">) {
  const { token } = await params;
  const { b } = await searchParams;
  const me = await participantByToken(token);
  if (!me) notFound();

  const batch = typeof b === "string" ? await batchById(b) : await latestPublishedBatch();
  const people = await allParticipants();
  const past = must(
    await db().from("batch_runs").select("id, run_date, published_at, shortlist, empty_reason").not("published_at", "is", null).order("published_at", { ascending: false }).limit(15),
  ) as Pick<BatchRun, "id" | "run_date" | "published_at" | "shortlist" | "empty_reason">[];

  const [top, also, votes] = batch
    ? await Promise.all([listingViews(batch.shortlist), listingViews(batch.also_qualified), batchVotes(batch.id)])
    : [[], [], [] as VoteRow[]];

  return (
    <>
      <PageHeader
        title="Shortlist"
        subtitle={batch?.published_at ? `Published ${formatIst(batch.published_at)}. Votes stay sealed until all three are in.` : "Shortlists publish daily at 7:05pm."}
        who={me.name}
      />
      <main className="container">
        {!batch && (
          <section className="card empty">
            <div className="big">🗳️</div>
            <h2>No shortlist yet</h2>
            <p className="muted small">The first one publishes at 7:05pm once all three have filled in their constraints. Or use Publish now on Home.</p>
          </section>
        )}
        {batch?.empty_reason && (
          <section className="card empty">
            <div className="big">🌙</div>
            <h2>{batch.empty_reason}</h2>
            <p className="muted small">That&apos;s an honest empty result, not an error. Keep forwarding listings to @Phlatbot.</p>
          </section>
        )}

        {batch && top.map((l, i) => (
          <ShortlistCard key={l.id} rank={i + 1} l={l} batch={batch} people={people} votes={votes.filter((v) => v.listing_id === l.id)} meId={me.id} token={token} />
        ))}

        {also.length > 0 && (
          <section className="card">
            <h2>Also qualified</h2>
            <p className="muted small">Not in the top 3, so there&apos;s no vote on these.</p>
            {also.map((l) => (
              <div className="person-row" key={l.id}>
                <span>
                  <strong>{l.structured.normalized_locality ?? "Locality not confirmed"}</strong>
                  <span className="muted small"> · {inr(l.structured.monthly_rent)}/mo</span>
                </span>
                <span className="pill">{l.assessment?.overall_rank} qualify</span>
              </div>
            ))}
          </section>
        )}

        {past.length > 1 && (
          <section className="card">
            <h2>Past shortlists</h2>
            {past.map((p) => (
              <div className="person-row" key={p.id}>
                <Link href={`/p/${token}/shortlist?b=${p.id}`}>{p.published_at ? formatIst(p.published_at) : p.run_date}</Link>
                <span className="muted small">{p.empty_reason ? "Empty" : `${p.shortlist.length} flat(s)`}{p.id === batch?.id ? " · viewing" : ""}</span>
              </div>
            ))}
          </section>
        )}
        <p className="footer-note">Phlatmatch never picks a winner. The decision is your conversation.</p>
      </main>
    </>
  );
}

function ShortlistCard({ rank, l, batch, people, votes, meId, token }: {
  rank: number; l: ListingView; batch: BatchRun; people: { id: string; name: string }[]; votes: VoteRow[]; meId: string; token: string;
}) {
  const s = l.structured;
  const a = l.assessment;
  const { revealed, auto } = isRevealed(batch, votes);
  const mine = votes.find((v) => v.participant_id === meId) ?? null;
  const waiting = people.filter((p) => !votes.some((v) => v.participant_id === p.id));

  return (
    <section className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="pill accent">#{rank} · qualifies for {a?.overall_rank}</span>
        {a?.soft_score != null && <span className="pill">Preference fit {Math.round(a.soft_score * 100)}%</span>}
      </div>
      <div className="rent-line" style={{ marginTop: 10 }}>
        <span className="big">{inr(s.monthly_rent)}</span>
        {s.monthly_rent !== null && <span className="muted small">/mo · {inr(s.monthly_rent / 3)} each</span>}
      </div>
      <h2 style={{ marginTop: 2 }}>{s.normalized_locality ?? "Locality not confirmed"}</h2>
      <div className="facts">
        <span>🛁 {s.bathrooms ?? "?"} bath</span>
        <span>🛗 {s.has_lift === null ? "Lift ?" : s.has_lift ? "Lift" : "No lift"}</span>
        <span>🚗 {s.has_parking === null ? "Parking ?" : s.has_parking ? "Parking" : "No parking"}</span>
        <span>🛋 {s.furnishing ?? "furnishing ?"}</span>
        <span>🔐 {inr(s.security_deposit)} deposit</span>
      </div>

      <div className="people-grid">
        {people.map((p) => {
          const pa = a?.per_person.find((x) => x.participant_id === p.id);
          if (!pa) return null;
          return (
            <div className="person-box" key={p.id}>
              <div className="row" style={{ justifyContent: "space-between", gap: 6 }}>
                <strong>{p.name}{p.id === meId ? " (you)" : ""}</strong>
                <span className={`pill ${pa.status === "qualifies" ? "ok" : "bad"}`}>{pa.status === "qualifies" ? "Qualifies" : "Out"}</span>
              </div>
              {pa.reasons.map((r) => <div key={r} className="small error">✕ {r}</div>)}
              {pa.status === "qualifies" && (pa.soft_score === null ? (
                <div className="muted small">No preferences set, so no score.</div>
              ) : (
                <div>
                  <div className="row small" style={{ justifyContent: "space-between" }}>
                    <span className="muted">Weighted preferences met</span><strong>{Math.round(pa.soft_score * 100)}%</strong>
                  </div>
                  <div className="bar"><span style={{ width: `${pa.soft_score * 100}%` }} /></div>
                </div>
              ))}
              <div>
                {pa.soft_match_notes.map((n) => (
                  <span key={n.label} className={`pref ${OUTCOME[n.outcome]}`} title={n.evidence}>
                    {n.outcome === "matched" ? "✓" : n.outcome === "not_matched" ? "✕" : "?"} {n.label} ({n.weight}){n.outcome === "no_data" ? ": not mentioned" : ""}
                  </span>
                ))}
              </div>
              {pa.unconfirmed.map((u) => <span key={u} className="pill warn" style={{ whiteSpace: "normal" }}>{u}</span>)}
              {pa.flagged_ambiguous.map((f) => (
                <span key={f.no_go_area} className="pill warn" style={{ whiteSpace: "normal" }}>
                  Waiting on {p.name}: is {f.normalized_locality} inside no-go &quot;{f.no_go_area}&quot;?
                </span>
              ))}
            </div>
          );
        })}
      </div>

      <div className="narrative">{a?.narrative ?? "The written summary isn't available for this flat. The breakdown above is complete."}</div>

      <div style={{ marginTop: 14 }}>
        {revealed ? (
          <div className="card inset" style={{ marginBottom: 0 }}>
            <strong>{auto ? "Revealed after 24 hours" : "Revealed: all three voted"}</strong>
            {people.map((p) => {
              const v = votes.find((x) => x.participant_id === p.id);
              return (
                <div className="person-row" key={p.id}>
                  <span><strong>{p.name}</strong>{v?.comment ? <span className="muted small"> · “{v.comment}”</span> : null}</span>
                  <span className={`pill ${!v ? "" : v.reaction === "interested" ? "ok" : v.reaction === "maybe" ? "warn" : "bad"}`}>{v ? v.reaction : "didn't vote"}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <VoteBox token={token} batchId={batch.id} listingId={l.id} mine={mine ? { reaction: mine.reaction, comment: mine.comment } : null} />
            <div className="seal-row" style={{ marginTop: 10 }}>
              <span className="small muted">🔒 Sealed:</span>
              {people.map((p) => {
                const voted = votes.some((v) => v.participant_id === p.id);
                return <span key={p.id} className={`seal${voted ? " in" : ""}`} title={`${p.name}: ${voted ? "voted" : "not yet"}`}>{voted ? "✓" : p.name[0]}</span>;
              })}
              <span className="small muted">Waiting on: {waiting.map((w) => w.name).join(", ") || "nobody"}</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
