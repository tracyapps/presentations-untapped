import { asc, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, decks } from "@/lib/db/schema";

/**
 * The companies library (LIBRARIES.md §4.1) — v1 slice.
 *
 * This is deliberately the "super basic" first cut: identity fields, a deck
 * count, and now a detail/edit screen. Contacts and live CRM sync are real
 * §4.1 scope, just not this pass — the CRM id columns are here and editable,
 * but there is no outbound "View in Bitrix/Airtable" link yet since neither
 * base URL is configured anywhere in this codebase.
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

export type CompanyDetail = CompanySummary & {
  logoDarkUrl: string | null;
  logoMarkUrl: string | null;
  brandPrimary: string | null;
  brandSecondary: string | null;
  bitrixId: string | null;
  airtableBaseId: string | null;
  airtableTableId: string | null;
  airtableRecordId: string | null;
  notes: string | null;
  archivedAt: string | null;
};

export type CompanyDeckSummary = {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "in_review" | "approved";
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

export async function getCompany(id: string): Promise<CompanyDetail | null> {
  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      slug: clients.slug,
      logoUrl: clients.logoUrl,
      logoDarkUrl: clients.logoDarkUrl,
      logoMarkUrl: clients.logoMarkUrl,
      website: clients.website,
      industry: clients.industry,
      brandPrimary: clients.brandPrimary,
      brandSecondary: clients.brandSecondary,
      bitrixId: clients.bitrixId,
      airtableBaseId: clients.airtableBaseId,
      airtableTableId: clients.airtableTableId,
      airtableRecordId: clients.airtableRecordId,
      notes: clients.notes,
      archivedAt: clients.archivedAt,
      createdAt: clients.createdAt,
      updatedAt: clients.updatedAt,
      deckCount: count(decks.id),
    })
    .from(clients)
    .leftJoin(decks, eq(decks.clientId, clients.id))
    .where(eq(clients.id, id))
    .groupBy(clients.id)
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    ...row,
    deckCount: Number(row.deckCount),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
  };
}

export async function getCompanyDecks(id: string): Promise<CompanyDeckSummary[]> {
  const rows = await db
    .select({
      id: decks.id,
      title: decks.title,
      slug: decks.slug,
      status: decks.status,
      updatedAt: decks.updatedAt,
    })
    .from(decks)
    .where(eq(decks.clientId, id))
    .orderBy(desc(decks.updatedAt));

  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}
