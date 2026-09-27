import PageHeader from "@/app/components/PageHeader";

export default function Landing() {
  return (
    <div className="main-col" style={{ maxWidth: 760, margin: "0 auto" }}>
      <PageHeader eyebrow="Pune flat search" title="Phlatmatch" subtitle="One form each, filled in separately. Then two or three flats you can actually discuss." />
      <main className="container">
        <section className="card hero-card">
          <h2>Private to Riya, Meera and Kavita</h2>
          <p style={{ margin: 0 }}>
            Open the personal link you were sent. It&apos;s your own app for constraints, listings, the daily shortlist and your
            private vote. Listings go to @Phlatbot on Telegram.
          </p>
        </section>
      </main>
    </div>
  );
}
