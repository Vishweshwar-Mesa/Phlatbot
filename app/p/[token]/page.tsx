import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/app/components/PageHeader";
import { db, must } from "@/lib/db";
import { BOT_USERNAME, telegramConnectUrl } from "@/lib/links";
import { allParticipants, participantByToken } from "@/lib/participants";

export const dynamic = "force-dynamic";

export default async function Home({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const me = await participantByToken(token);
  if (!me) notFound();

  const people = await allParticipants();
  const done = people.filter((p) => p.form_submitted_at);
  const waiting = people.filter((p) => !p.form_submitted_at);
  const statuses = (must(await db().from("listings").select("status")) as { status: string }[]).map((l) => l.status);
  const count = (s: string) => statuses.filter((x) => x === s).length;

  return (
    <>
      <PageHeader
        title={`Hi ${me.name} 👋`}
        subtitle="Your private Phlatmatch. Nobody else sees your answers or your votes before the reveal."
        who={me.name}
      />
      <main className="container">
        {!me.telegram_user_id && (
          <section className="card highlight">
            <div className="section-head">
              <span className="section-icon">✈️</span>
              <div>
                <span className="eyebrow">One-time setup</span>
                <h2>Connect Telegram</h2>
                <p className="muted small" style={{ margin: 0 }}>
                  You send listings to @{BOT_USERNAME} on Telegram. One tap links your account, so the bot knows
                  they&apos;re from you.
                </p>
              </div>
            </div>
            <a className="btn primary" style={{ display: "block" }} href={telegramConnectUrl(token)}>
              Open @{BOT_USERNAME} and connect
            </a>
            <p className="hint">Telegram opens with a Start button. Tap it and you&apos;re done.</p>
          </section>
        )}

        {!me.form_submitted_at && (
          <section className="card highlight">
            <div className="section-head">
              <span className="section-icon">🎚️</span>
              <div>
                <span className="eyebrow">Needs your answer</span>
                <h2>Fill in your constraints</h2>
                <p className="muted small" style={{ margin: 0 }}>
                  Nothing gets matched until all three of you have done this.
                </p>
              </div>
            </div>
            <Link className="btn primary" style={{ display: "block" }} href={`/p/${token}/constraints`}>
              Start
            </Link>
          </section>
        )}

        <section className="card">
          <div className="section-head">
            <span className="section-icon">👥</span>
            <div>
              <h2>Everyone&apos;s constraints</h2>
              <p className="muted small" style={{ margin: 0 }}>
                {waiting.length === 0
                  ? "All three are in. Listings can be matched."
                  : `${done.length}/3 done, waiting on ${waiting.map((w) => w.name).join(", ")}.`}
              </p>
            </div>
          </div>
          <div className="progress" aria-hidden>
            <span style={{ width: `${(done.length / 3) * 100}%` }} />
          </div>
          {people.map((p) => (
            <div className="person-row" key={p.id}>
              <span className="row" style={{ gap: 0 }}>
                <span className="avatar">{p.name[0]}</span>
                {p.name}
                {p.id === me.id && <span className="muted small">&nbsp;(you)</span>}
              </span>
              <span className="row" style={{ gap: 6 }}>
                {p.form_submitted_at ? <span className="pill ok">Constraints in</span> : <span className="pill warn">Waiting</span>}
                {!p.telegram_user_id && <span className="pill">No Telegram yet</span>}
              </span>
            </div>
          ))}
        </section>

        <section className="card">
          <div className="section-head">
            <span className="section-icon">🏢</span>
            <div>
              <h2>Listings</h2>
              <p className="muted small" style={{ margin: 0 }}>
                Forward or paste listings to @{BOT_USERNAME}. Shortlists publish daily at 7:05pm.
              </p>
            </div>
          </div>
          <div className="chip-list">
            <span className="pill">{count("draft")} awaiting confirmation</span>
            <span className="pill">{count("awaiting_preferences")} waiting for everyone&apos;s constraints</span>
            <span className="pill accent">{count("pending") + count("assessed_unpublished")} queued for next shortlist</span>
            <span className="pill ok">{count("published")} published</span>
          </div>
        </section>

        <p className="footer-note">Phlatmatch never picks a flat for you. It makes the trade-offs visible.</p>
      </main>
    </>
  );
}
