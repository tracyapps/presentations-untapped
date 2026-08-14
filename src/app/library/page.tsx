import { auth } from "@clerk/nextjs/server";
import AppHeader from "@/components/AppHeader";
import BlockLibrary from "@/components/library/BlockLibrary";
import { blockTaxonomyOptions } from "@/components/library/block-catalog";
import { getBlockLibraryItems } from "@/lib/data/library";
import { getTagsForSubject } from "@/lib/data/taxonomy";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const { userId } = await auth();
  const [items, allTags] = await Promise.all([
    getBlockLibraryItems(userId ?? undefined),
    getTagsForSubject("library_item"),
  ]);

  const { categories, tagOptions } = blockTaxonomyOptions(items, allTags);

  return (
    <main className="app-shell">
      <AppHeader />
      <BlockLibrary items={items} categories={categories} tagOptions={tagOptions} />
    </main>
  );
}
