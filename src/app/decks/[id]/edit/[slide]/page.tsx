import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import SlideEditor from "@/components/SlideEditor";
import { blockTaxonomyOptions } from "@/components/library/block-catalog";
import { getEditorDeck } from "@/lib/data/editor";
import { getBlockLibraryItems } from "@/lib/data/library";
import { getMediaLibrary } from "@/lib/data/media";
import { getTagsForSubject } from "@/lib/data/taxonomy";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string; slide: string }> };

export default async function EditorPage({ params }: Props) {
  const { id, slide } = await params;
  const { userId } = await auth();
  // The editor now hosts the real block library — the same filters, the same
  // categories, the same favourites — so it needs the same data the library
  // page loads, not a name-only list.
  const [deck, libraryItems, mediaLibrary, allTags] = await Promise.all([
    getEditorDeck(id),
    getBlockLibraryItems(userId ?? undefined),
    getMediaLibrary(),
    getTagsForSubject("library_item"),
  ]);
  if (!deck) notFound();
  if (!deck.slides.length) notFound();

  const position = Number.parseInt(slide, 10);
  const current = deck.slides.find((item) => item.position === position);
  if (!current) redirect(`/decks/${id}/edit/${deck.slides[0].position}`);

  const { categories, tagOptions } = blockTaxonomyOptions(libraryItems, allTags);

  return (
    <SlideEditor
      deck={deck}
      initialSlide={current}
      libraryItems={libraryItems}
      libraryCategories={categories}
      libraryTags={tagOptions}
      mediaLibrary={mediaLibrary}
      key={current.id}
    />
  );
}
