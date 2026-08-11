import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import DeckDashboard from "@/components/DeckDashboard";
import { getDeckSummaries } from "@/lib/data/decks";

export const dynamic = "force-dynamic";

export default async function DecksPage() {
  const decks = await getDeckSummaries();

  return (
    <main className="app-shell">
      <AppHeader />
      <section className="page-heading">
        <div>
          <p className="eyebrow">Pitch deck workspace</p>
          <h1>Decks</h1>
          <p>Build, review, and publish client presentations.</p>
        </div>
        <Link className="button button-primary" href="/decks/new">New deck</Link>
      </section>
      <DeckDashboard decks={decks} />
    </main>
  );
}
