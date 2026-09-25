import PageHeader from "@/app/components/PageHeader";

export const dynamic = "force-dynamic";

export default function History() {
  return (
    <>
      <PageHeader title="History" subtitle="Past shortlists and their revealed votes." />
      <main className="container">
        <section className="card empty">
          <div className="big">🕘</div>
          <h2>Nothing here yet</h2>
          <p className="muted small">Each day&apos;s shortlist appears here once it&apos;s published.</p>
        </section>
      </main>
    </>
  );
}
