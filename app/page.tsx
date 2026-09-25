import PageHeader from "@/app/components/PageHeader";

export default function Landing() {
  return (
    <>
      <PageHeader
        title="Phlatmatch"
        subtitle="One form each, filled in separately. Then two or three flats you can actually discuss."
      />
      <main className="container">
        <section className="card">
          <h2>Private to Riya, Meera and Kavita</h2>
          <p className="muted">
            Open the personal link you were sent. It&apos;s your own app for constraints, the daily shortlist and your
            private vote. Listings go to @Phlatbot on Telegram.
          </p>
        </section>
      </main>
    </>
  );
}
