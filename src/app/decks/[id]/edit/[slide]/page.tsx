import { notFound, redirect } from "next/navigation";
import SlideEditor from "@/components/SlideEditor";
import { getEditorDeck } from "@/lib/data/editor";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string; slide: string }> };

export default async function EditorPage({ params }: Props) {
  const { id, slide } = await params;
  const deck = await getEditorDeck(id);
  if (!deck) notFound();
  if (!deck.slides.length) notFound();

  const position = Number.parseInt(slide, 10);
  const current = deck.slides.find((item) => item.position === position);
  if (!current) redirect(`/decks/${id}/edit/${deck.slides[0].position}`);

  return <SlideEditor deck={deck} initialSlide={current} key={current.id} />;
}
