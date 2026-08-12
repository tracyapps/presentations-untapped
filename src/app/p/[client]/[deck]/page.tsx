import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PresentDeck from "@/components/PresentDeck";
import { getPublishedDeck } from "@/lib/data/editor";

/** Published decks change when someone re-approves them, and there are few
 *  enough that caching is not worth the staleness risk. */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ client: string; deck: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { client, deck: deckSlug } = await params;
  const deck = await getPublishedDeck(client, deckSlug);
  if (!deck) return { title: "Not found", robots: { index: false, follow: false } };

  const subtitle = deck.eventName ? `${deck.eventName} · ${deck.clientName}` : deck.clientName;
  return {
    title: `${deck.title} — ${deck.clientName}`,
    description: subtitle,
    // Client decks are for the client, not for Google. Every published deck is
    // noindex; the URL is shared by email, never discovered.
    robots: { index: false, follow: false, nocache: true },
    openGraph: {
      title: deck.title,
      description: subtitle,
      type: "website",
      siteName: "Loyalty Untapped",
    },
    twitter: { card: "summary_large_image", title: deck.title, description: subtitle },
  };
}

export default async function PublicDeckPage({ params }: Props) {
  const { client, deck: deckSlug } = await params;
  const deck = await getPublishedDeck(client, deckSlug);

  // Not approved, never published, or un-published since — all 404. Nothing
  // here distinguishes "does not exist" from "not published", on purpose.
  if (!deck) notFound();

  return <PresentDeck deck={deck} variant="public" />;
}
