import { notFound } from "next/navigation";
import PresentDeck from "@/components/PresentDeck";
import { getEditorDeck } from "@/lib/data/editor";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
};

export default async function PresentPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { from } = await searchParams;
  const deck = await getEditorDeck(id);
  if (!deck?.slides.length) notFound();

  // `?from=N` is the "present from this slide" path. Clamped rather than
  // 404'd: a stale link after a slide is deleted should still present.
  const requested = Number(from);
  const startIndex = Number.isFinite(requested)
    ? Math.min(Math.max(1, Math.trunc(requested)), deck.slides.length) - 1
    : 0;

  return <PresentDeck deck={deck} startIndex={startIndex} />;
}
