import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import AppHeader from "@/components/AppHeader";
import BlockDetail from "@/components/library/BlockDetail";
import { getBlockLibraryItem } from "@/lib/data/library";
import { getComments } from "@/lib/data/comments";
import { getTags } from "@/lib/data/taxonomy";

export const dynamic = "force-dynamic";

export default async function BlockDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();

  const item = await getBlockLibraryItem(id, userId ?? undefined);
  if (!item) notFound();

  const [comments, allTags] = await Promise.all([
    getComments("library_item", id),
    getTags(),
  ]);

  return (
    <main className="app-shell">
      <AppHeader />
      <BlockDetail
        item={item}
        comments={comments}
        categorySuggestions={allTags.filter((tag) => tag.kind === "category").map((tag) => tag.name)}
        tagSuggestions={allTags.filter((tag) => tag.kind === "tag").map((tag) => tag.name)}
      />
    </main>
  );
}
