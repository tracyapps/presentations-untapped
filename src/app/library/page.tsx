import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import LibraryManager from "@/components/LibraryManager";
import { getBlockLibraryItems } from "@/lib/data/library";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const items = await getBlockLibraryItems();

  return (
    <main className="app-shell">
      <AppHeader />
      <section className="page-heading">
        <div>
          <p className="eyebrow">Reusable content</p>
          <h1>Library</h1>
          <p>Find, rename, and remove saved block snapshots.</p>
        </div>
        <Link className="button button-secondary" href="/decks">Back to decks</Link>
      </section>
      <LibraryManager initialItems={items} />
    </main>
  );
}
