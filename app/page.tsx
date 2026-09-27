import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import PageHeader from "@/app/components/PageHeader";
import { allParticipants } from "@/lib/participants";

export const dynamic = "force-dynamic";

// The one shared link. Pick your name once; this device remembers it.
export default async function Landing({ searchParams }: PageProps<"/">) {
  const { pick } = await searchParams;
  const people = await allParticipants();
  const remembered = (await cookies()).get("pm_me")?.value;
  if (!pick && remembered && people.some((p) => p.form_token === remembered)) redirect(`/p/${remembered}`);

  return (
    <div className="main-col" style={{ maxWidth: 560, margin: "0 auto" }}>
      <PageHeader eyebrow="Pune flat search" title="Who's this?" subtitle="Tap your own name. This phone will remember you." />
      <main className="container">
        <section className="card" style={{ display: "grid", gap: 10 }}>
          {people.map((p) => (
            <a key={p.id} className="mini" href={`/me/${encodeURIComponent(p.name)}`} style={{ border: "1px solid var(--border)" }}>
              <span className="avatar">{p.name[0]}</span>
              <span className="grow">
                <span className="t" style={{ display: "block" }}>{p.name}</span>
                <span className="muted small">{p.form_submitted_at ? "Constraints in" : "Constraints not filled in yet"}</span>
              </span>
              <span className="muted">→</span>
            </a>
          ))}
        </section>
        <p className="hint" style={{ textAlign: "center" }}>
          Your constraints and votes are yours. Only pick your own name. Listings go to @Phlatbot on Telegram.
        </p>
      </main>
    </div>
  );
}
