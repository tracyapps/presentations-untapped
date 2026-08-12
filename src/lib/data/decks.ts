import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, decks, events, slides } from "@/lib/db/schema";
import type { SlideDoc } from "@/lib/slides/types";

export type DeckSummary = {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "in_review" | "approved";
  themeDefault: "light" | "dark";
  createdAt: string;
  updatedAt: string;
  clientId: string;
  clientName: string;
  clientSlug: string;
  eventName: string | null;
  slideCount: number;
  /** Slide 1's block tree, rendered as the card thumbnail. Null for an empty
   *  deck, which the card shows as an explicit empty state. */
  firstSlide: SlideDoc | null;
};

export type ClientOption = {
  id: string;
  name: string;
  slug: string;
};

export async function getDeckSummaries(): Promise<DeckSummary[]> {
  const rows = await db
    .select({
      id: decks.id,
      title: decks.title,
      slug: decks.slug,
      status: decks.status,
      themeDefault: decks.themeDefault,
      createdAt: decks.createdAt,
      updatedAt: decks.updatedAt,
      clientId: clients.id,
      clientName: clients.name,
      clientSlug: clients.slug,
      eventName: events.name,
      slideCount: count(slides.id),
    })
    .from(decks)
    .innerJoin(clients, eq(decks.clientId, clients.id))
    .leftJoin(events, eq(decks.eventId, events.id))
    .leftJoin(slides, eq(slides.deckId, decks.id))
    .groupBy(decks.id, clients.id, events.name)
    .orderBy(desc(decks.updatedAt), asc(decks.title));

  // First slide per deck, for the dashboard thumbnail. A second small query
  // rather than a join: the aggregate above groups by deck, and dragging a
  // jsonb document through that grouping is worse than one extra round trip.
  const deckIds = rows.map((row) => row.id);
  const firstSlides = new Map<string, SlideDoc>();
  if (deckIds.length) {
    const slideRows = await db
      .select({ deckId: slides.deckId, blocks: slides.blocks, position: slides.position })
      .from(slides)
      .where(and(inArray(slides.deckId, deckIds), eq(slides.position, 1)));
    for (const slide of slideRows) firstSlides.set(slide.deckId, slide.blocks);
  }

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    slideCount: Number(row.slideCount),
    firstSlide: firstSlides.get(row.id) ?? null,
  }));
}

export async function getClientOptions(): Promise<ClientOption[]> {
  return db
    .select({ id: clients.id, name: clients.name, slug: clients.slug })
    .from(clients)
    .orderBy(asc(clients.name));
}
