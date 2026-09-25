import { redirect } from "next/navigation";

// Old form links now open the Constraints tab of the person's app.
export default async function LegacyForm({ params }: PageProps<"/form/[token]">) {
  const { token } = await params;
  redirect(`/p/${encodeURIComponent(token)}/constraints`);
}
