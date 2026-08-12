import { auth } from "@clerk/nextjs/server";
import AppHeader from "@/components/AppHeader";
import BlockLibrary from "@/components/library/BlockLibrary";
import { getBlockLibraryItems } from "@/lib/data/library";
import { getTagsForSubject } from "@/lib/data/taxonomy";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const { userId } = await auth();
  const [items, allTags] = await Promise.all([
    getBlockLibraryItems(userId ?? undefined),
    getTagsForSubject("library_item"),
  ]);

  // Counts come from the items actually on the page rather than from the tag
  // table, so a filter never offers an option that returns nothing.
  const used = (id: string) => items.filter((item) =>
    item.category?.id === id || item.tags.some((tag) => tag.id === id)).length;

  const categories = allTags.filter((tag) => tag.kind === "category")
    .map((tag) => ({ id: tag.id, name: tag.name, count: used(tag.id) }))
    .filter((tag) => tag.count > 0);

  const tagOptions = allTags.filter((tag) => tag.kind === "tag")
    .map((tag) => ({ id: tag.id, name: tag.name, count: used(tag.id) }))
    .filter((tag) => tag.count > 0);

  return (
    <main className="app-shell">
      <AppHeader />
      <BlockLibrary items={items} categories={categories} tagOptions={tagOptions} />
    </main>
  );
}
