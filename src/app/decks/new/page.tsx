import AppHeader from "@/components/AppHeader";
import CreateDeckForm from "@/components/CreateDeckForm";
import { getClientOptions } from "@/lib/data/decks";

export const dynamic = "force-dynamic";

export default async function NewDeckPage() {
  const clients = await getClientOptions();

  return (
    <main className="app-shell app-shell-narrow">
      <AppHeader />
      <section className="page-heading page-heading-stacked">
        <p className="eyebrow">New pitch deck</p>
        <h1>Create a deck</h1>
        <p>Choose the client and we’ll prepare the first slide.</p>
      </section>
      <CreateDeckForm clients={clients} />
    </main>
  );
}
