import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/app/components/PageHeader";
import { db, must } from "@/lib/db";
import { BOT_USERNAME } from "@/lib/links";
import { allParticipants, participantByToken } from "@/lib/participants";
import { digestCutoff, formatIst, istDate } from "@/lib/time";
import { inr, listingViews } from "@/lib/views";
import { batchVotes, isRevealed, latestPublishedBatch } from "@/lib/votes";
import { NoGoQuestion, PublishNow } from "./_components/HomeActions";

export const dynamic = "force-dynamic";

/** Deterministic pastel gradient per listing, standing in for a photo. */
function band(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(135deg,hsl(${h} 55% 82%),hsl(${(h + 70) % 360} 60% 86%))`;
}

/** Time-dependent figures, computed per request (outside render for the purity lint). */
function clock() {
  const now = new Date();
  const today = new Date(`${istDate(now)}T19:05:00+05:30`);
  const next = today > now ? today : new Date(today.getTime() + 24 * 3600e3);
  return {
    weekAgo: now.getTime() - 7 * 24 * 3600e3,
    recentCutoff: now.getTime() - 24 * 3600e3,
    mins: Math.max(0, Math.round((next.getTime() - now.getTime()) / 60000)),
    afterCutoff: now.getTime() > digestCutoff(now).getTime(),
    weekday: new Intl.DateTimeFormat("en-IN", { weekday: "long", timeZone: "Asia/Kolkata" }).format(now),
  };
}

export default async function Dashboard({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const me = await participantByToken(token);
  if (!me) notFound();

  const [people, rows, questions, latest, recent] = await Promise.all([
    allParticipants(),
    db().from("listings").select("status, submitted_at, structured").neq("status", "draft"),
    db().from("no_go_confirmations").select("normalized_locality, no_go_area").eq("participant_id", me.id).is("is_no_go", null),
    latestPublishedBatch(),
    listingViews().then((v) => v.slice(0, 4)),
  ]);
  const listings = must(rows) as { status: string; submitted_at: string; structured: { monthly_rent: number | null } }[];
  const qs = must(questions) as { normalized_locality: string; no_go_area: string }[];
  const done = people.filter((p) => p.form_submitted_at);
  const waiting = people.filter((p) => !p.form_submitted_at);

  const inPool = listings.filter((l) => l.status !== "published");
  const { weekAgo, mins, afterCutoff, weekday, recentCutoff } = clock();
  const thisWeek = listings.filter((l) => new Date(l.submitted_at).getTime() > weekAgo).length;
  const shares = listings.map((l) => l.structured.monthly_rent).filter((r): r is number => r !== null).map((r) => r / 3).sort((a, b) => a - b);
  const median = shares.length ? shares[Math.floor(shares.length / 2)] : null;

  let toVote = 0;
  if (latest?.shortlist.length) {
    const votes = await batchVotes(latest.id);
    toVote = latest.shortlist.filter((id) => {
      const vs = votes.filter((v) => v.listing_id === id);
      return !isRevealed(latest, vs).revealed && !vs.some((v) => v.participant_id === me.id);
    }).length;
  }


  return (
    <>
      <PageHeader eyebrow={`${weekday} · Pune`} title={`Hi ${me.name}`} who={me.name} />
      <main className="container">
        <div className="dash">
          <section className="card hero-card span-8">
            <span className="eyebrow" style={{ color: "inherit", opacity: 0.8 }}>Next shortlist · 7:05pm IST</span>
            <h2>
              {waiting.length
                ? `Matching starts once ${waiting.map((w) => w.name).join(" and ")} ${waiting.length === 1 ? "fills" : "fill"} in constraints.`
                : inPool.length
                  ? `Next shortlist lands in ${Math.floor(mins / 60)}h ${mins % 60}m. ${inPool.length} flat${inPool.length === 1 ? " is" : "s are"} in the running.`
                  : latest?.shortlist.length
                    ? `The shortlist is out: ${latest.shortlist.length} flats to discuss. ${toVote ? `You have ${toVote} vote${toVote === 1 ? "" : "s"} to cast.` : "You've voted on all of them."}`
                    : `Next shortlist in ${Math.floor(mins / 60)}h ${mins % 60}m. Send listings to @${BOT_USERNAME} to add to the pool.`}
            </h2>
            <div className="cd-row">
              <div className="cd"><span className="num">{inPool.length}</span><small>in the pool</small></div>
              <div className="cd"><span className="num">{done.length}/3</span><small>constraints in</small></div>
              <div className="cd"><span className="num">6pm</span><small>{afterCutoff ? "cutoff passed: new ones roll to tomorrow" : "cutoff for today"}</small></div>
            </div>
            <div className="row">
              <Link className="btn primary" href={`/p/${token}/listings`}>See the pool</Link>
              {latest && <Link className="btn secondary" href={`/p/${token}/shortlist`}>Latest shortlist</Link>}
            </div>
            <svg className="hero-art" viewBox="0 0 200 150" aria-hidden="true">
              <rect x="20" y="50" width="70" height="100" rx="6" fill="var(--card)" opacity=".7" />
              <rect x="100" y="20" width="80" height="130" rx="6" fill="var(--card)" opacity=".85" />
              {[0, 1, 2, 3, 4].flatMap((r) => [0, 1, 2].map((c) => (
                <rect key={`${r}${c}`} x={112 + c * 22} y={34 + r * 22} width="12" height="12" rx="2" fill="var(--accent)" opacity={(r + c) % 3 ? 0.35 : 0.7} />
              )))}
            </svg>
          </section>

          <section className="card span-4">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
              <h2>The three of you</h2>
              <span className={`pill ${waiting.length ? "warn" : "ok"}`}>{done.length}/3 ready</span>
            </div>
            {people.map((p) => (
              <div className="person-row" key={p.id}>
                <span className="row" style={{ gap: 0, flexWrap: "nowrap" }}>
                  <span className="avatar">{p.name[0]}</span>
                  <span>
                    <strong>{p.name}</strong>{p.id === me.id && <span className="muted"> (you)</span>}
                    <span className="muted small" style={{ display: "block" }}>{p.form_submitted_at ? "Constraints in" : "Hasn't filled in constraints"}</span>
                  </span>
                </span>
                {p.form_submitted_at ? <span className="pill ok">✓ Ready</span> : <span className="pill warn">Waiting</span>}
              </div>
            ))}
            <p className="hint">Nothing is matched until all three are ready.</p>
          </section>

          {!me.form_submitted_at && (
            <section className="card highlight span-12">
              <span className="eyebrow">Needs your answer</span>
              <h2 style={{ margin: "4px 0" }}>Fill in your constraints</h2>
              <p className="muted small">Takes about 3 minutes. The others never see your answers.</p>
              <Link className="btn primary" href={`/p/${token}/constraints`}>Start</Link>
            </section>
          )}

          <section className="card stat span-3">
            <span className="label">Listings this week</span><span className="num">{thisWeek}</span>
            <span className="muted small">{listings.length} confirmed in total</span>
          </section>
          <section className="card stat span-3">
            <span className="label">Your votes pending</span><span className="num">{toVote}</span>
            <Link className="small" href={`/p/${token}/shortlist`}>{toVote ? "Vote now →" : "Open shortlist →"}</Link>
          </section>
          <section className="card stat span-3">
            <span className="label">Median rent / share</span><span className="num">{median ? inr(median) : "–"}</span>
            <span className="muted small">Across confirmed listings</span>
          </section>
          <section className="card stat span-3">
            <span className="label">Last shortlist</span>
            <span className="num">{latest ? latest.shortlist.length : "–"}</span>
            <span className="muted small">{latest?.published_at ? formatIst(latest.published_at) : "None yet"}</span>
          </section>

          {qs.length > 0 && (
            <section className="card span-6" style={{ borderColor: "var(--warn)" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="eyebrow" style={{ color: "var(--warn)" }}>Needs your answer</span>
                <span className="pill warn">{qs.length}</span>
              </div>
              <h2 style={{ margin: "6px 0 10px" }}>Is this inside one of your no-go areas?</h2>
              {qs.map((q) => <NoGoQuestion key={q.normalized_locality + q.no_go_area} token={token} locality={q.normalized_locality} area={q.no_go_area} />)}
            </section>
          )}

          <section className={`card ${qs.length ? "span-6" : "span-8"}`}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
              <h2>Recently added</h2>
              <Link className="small" href={`/p/${token}/listings`}>All listings</Link>
            </div>
            {recent.length === 0 && <p className="muted small">No listings yet. Forward one to @{BOT_USERNAME}.</p>}
            {recent.map((l) => (
              <Link key={l.id} className="mini" href={`/p/${token}/listings`}>
                <span className="thumb" style={{ background: band(l.id), position: "relative" }}>
                  {recentCutoff < new Date(l.confirmed_at ?? l.submitted_at).getTime() && <span className="new-tag small-tag">New</span>}
                </span>
                <span className="grow">
                  <span className="t" style={{ display: "block" }}>{l.structured.normalized_locality ?? "Locality not confirmed"}</span>
                  <span className="muted small">{l.structured.monthly_rent === null ? "Rent not confirmed" : `${inr(l.structured.monthly_rent)}/mo`}{l.submitter ? ` · ${l.submitter === "From the brief" ? "from the brief" : `from ${l.submitter}`}` : ""}</span>
                </span>
                <span className="dots">
                  {people.map((p) => {
                    const pa = l.assessment?.per_person.find((x) => x.participant_id === p.id);
                    const st = !pa ? "x" : pa.status === "disqualified" ? "n" : pa.unconfirmed.length || pa.flagged_ambiguous.length ? "u" : "y";
                    return <span key={p.id} className={`qdot ${st}`}>{p.name[0]}</span>;
                  })}
                </span>
              </Link>
            ))}
          </section>

          <section className={`card ${qs.length ? "span-12" : "span-4"}`}>
            <h2>Publish now</h2>
            <p className="muted small">Re-scores unpublished listings and opens voting straight away. Once an hour.</p>
            <PublishNow token={token} />
          </section>
        </div>
        <p className="footer-note">Phlatmatch never picks a flat for you. It makes the trade-offs visible.</p>
      </main>
    </>
  );
}
