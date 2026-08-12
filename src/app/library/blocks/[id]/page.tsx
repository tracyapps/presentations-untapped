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
    /* Full-bleed: three columns need the room, and the preview band reads badly
       squeezed into the 1180px content width. */
    <main className="app-shell app-shell-wide">
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
