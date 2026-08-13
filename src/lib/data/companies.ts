import { asc, count, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, decks } from "@/lib/db/schema";

/**
 * The companies library (LIBRARIES.md §4.1) — v1 slice.
 *
 * This is deliberately the "super basic" first cut: identity fields plus a
 * deck count, no contacts, no CRM linkage, no detail page yet. Those are real
 * §4.1 scope, just not this pass.
 */
export type CompanySummary = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  website: string | null;
  industry: string | null;
  deckCount: number;
  createdAt: string;
  updatedAt: string;
};

export async function getCompanies(): Promise<CompanySummary[]> {
  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      slug: clients.slug,
      logoUrl: clients.logoUrl,
      website: clients.website,
      industry: clients.industry,
      createdAt: clients.createdAt,
      updatedAt: clients.updatedAt,
      deckCount: count(decks.id),
    })
    .from(clients)
    .leftJoin(decks, eq(decks.clientId, clients.id))
    // Archiving has no UI yet, but the column exists (LIBRARIES.md §2.5) and an
    // archived company should already read as hidden, not just unreachable.
    .where(isNull(clients.archivedAt))
    .groupBy(clients.id)
    .orderBy(asc(clients.name));

  return rows.map((row) => ({
    ...row,
    deckCount: Number(row.deckCount),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}
