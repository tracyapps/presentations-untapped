import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, decks, events, slides, voiceovers } from "@/lib/db/schema";
import type { SlideDoc } from "@/lib/slides/types";
import type { VoiceoverData } from "@/lib/voiceover";

export type EditorSlide = {
  id: string;
  position: number;
  layoutKey: string;
  blocks: SlideDoc;
  updatedAt: string;
  voiceover: VoiceoverData | null;
};

export type EditorDeck = {
  id: string;
  title: string;
  /** Public URL is /p/[clientSlug]/[slug] once approved. */
  slug: string;
  clientSlug: string;
  status: "draft" | "in_review" | "approved";
  themeDefault: "light" | "dark";
  clientName: string;
  eventName: string | null;
  slides: EditorSlide[];
};

/**
 * A deck for the public route (PLAN.md §5.7).
 *
 * Returns null unless the deck is **approved and published**. That pairing is
 * the whole access check — there is no auth on `/p/**`, so anything short of
 * both conditions has to 404, including a deck that was approved and later
 * moved back to draft.
 */
export async function getPublishedDeck(
  clientSlug: string, deckSlug: string,
): Promise<(EditorDeck & { clientSlug: string; deckSlug: string; publishedAt: string }) | null> {
  const [deck] = await db
    .select({
      id: decks.id,
      title: decks.title,
      slug: decks.slug,
      status: decks.status,
      publishedAt: decks.publishedAt,
      themeDefault: decks.themeDefault,
      clientName: clients.name,
      clientSlug: clients.slug,
      eventName: events.name,
    })
    .from(decks)
    .innerJoin(clients, eq(decks.clientId, clients.id))
    .leftJoin(events, eq(decks.eventId, events.id))
    .where(and(
      eq(clients.slug, clientSlug),
      eq(decks.slug, deckSlug),
      eq(decks.status, "approved"),
      isNotNull(decks.publishedAt),
    ))
    .limit(1);

  if (!deck?.publishedAt) return null;

  const full = await getEditorDeck(deck.id);
  if (!full?.slides.length) return null;

  return {
    ...full,
    clientSlug: deck.clientSlug,
    deckSlug: deck.slug,
    publishedAt: deck.publishedAt.toISOString(),
  };
}

export async function getEditorDeck(deckId: string): Promise<EditorDeck | null> {
  const [deck] = await db
    .select({
      id: decks.id,
      title: decks.title,
      slug: decks.slug,
      clientSlug: clients.slug,
      status: decks.status,
      themeDefault: decks.themeDefault,
      clientName: clients.name,
      eventName: events.name,
    })
    .from(decks)
    .innerJoin(clients, eq(decks.clientId, clients.id))
    .leftJoin(events, eq(decks.eventId, events.id))
    .where(eq(decks.id, deckId))
    .limit(1);

  if (!deck) return null;

  const slideRows = await db
    .select({
      id: slides.id,
      position: slides.position,
      layoutKey: slides.layoutKey,
      blocks: slides.blocks,
      updatedAt: slides.updatedAt,
      voiceoverId: voiceovers.id,
      audioUrl: voiceovers.audioUrl,
      audioMime: voiceovers.mime,
      audioDurationSec: voiceovers.durationSec,
      captionCues: voiceovers.cues,
      voiceoverUpdatedAt: voiceovers.updatedAt,
    })
    .from(slides)
    .leftJoin(voiceovers, eq(slides.id, voiceovers.slideId))
    .where(eq(slides.deckId, deckId))
    .orderBy(asc(slides.position));

  return {
    ...deck,
    slides: slideRows.map((slide) => ({
      id: slide.id,
      position: slide.position,
      layoutKey: slide.layoutKey,
      blocks: slide.blocks,
      updatedAt: slide.updatedAt.toISOString(),
      voiceover: slide.voiceoverId && slide.audioUrl && slide.audioMime
        && slide.audioDurationSec !== null && slide.captionCues && slide.voiceoverUpdatedAt
        ? {
          id: slide.voiceoverId,
          audioUrl: slide.audioUrl,
          mime: slide.audioMime,
          durationSec: slide.audioDurationSec,
          cues: slide.captionCues,
          updatedAt: slide.voiceoverUpdatedAt.toISOString(),
        }
        : null,
    })),
  };
}
