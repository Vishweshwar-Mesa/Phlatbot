import PageHeader from "@/app/components/PageHeader";

export const dynamic = "force-dynamic";

export default function Shortlist() {
  return (
    <>
      <PageHeader title="Shortlist" subtitle="Today's top flats, the trade-offs, and your private vote." />
      <main className="container">
        <section className="card empty">
          <div className="big">🗳️</div>
          <h2>No shortlist yet</h2>
          <p className="muted small">
            Shortlists publish at 7:05pm once all three have filled in their constraints and listings are in.
          </p>
        </section>
      </main>
    </>
  );
}
