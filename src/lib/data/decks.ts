import { asc, count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, decks, events, slides } from "@/lib/db/schema";

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

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    slideCount: Number(row.slideCount),
  }));
}

export async function getClientOptions(): Promise<ClientOption[]> {
  return db
    .select({ id: clients.id, name: clients.name, slug: clients.slug })
    .from(clients)
    .orderBy(asc(clients.name));
}
