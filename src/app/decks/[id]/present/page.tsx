import { notFound } from "next/navigation";
import PresentDeck from "@/components/PresentDeck";
import { getEditorDeck } from "@/lib/data/editor";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function PresentPage({ params }: Props) {
  const { id } = await params;
  const deck = await getEditorDeck(id);
  if (!deck?.slides.length) notFound();
  return <PresentDeck deck={deck} />;
}
