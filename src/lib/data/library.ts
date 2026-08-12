import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { libraryItems, slides } from "@/lib/db/schema";
import type { Node } from "@/lib/slides/types";
import { getFavoriteIds, getTaggingsFor, type Tag } from "./taxonomy";
import { getUserSummaries, type UserSummary } from "./users";

export type LibraryStatus = "draft" | "in_review" | "approved";

export type LibraryBlockItem = {
  id: string;
  name: string;
  description: string | null;
  node: Node;
  status: LibraryStatus;
  version: number;
  locked: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Resolved Clerk names, so versions, approvals, and comments are attributed
   *  from day one rather than retrofitted (LIBRARIES.md §2.8). */
  author: UserSummary | null;
  editor: UserSummary | null;
  approver: UserSummary | null;
  tags: Tag[];
  /** The single category, split out of `tags` for the UI (single-select). */
  category: Tag | null;
  favorited: boolean;
  /** Decks currently holding a linked copy. The number that makes "edit this at
   *  source" a decision rather than a shrug (LIBRARIES.md §5.3). */
  usageCount: number;
};

/**
 * How many decks link to each library item.
 *
 * Links live inside the slide's jsonb block tree, so this walks the document
 * with `jsonb_path_query` rather than joining a column. Postgres does the work;
 * the alternative is loading every slide document into Node just to count.
 */
async function getUsageCounts(): Promise<Map<string, number>> {
  const result = await db.execute<{ item_id: string; deck_count: number }>(sql`
    SELECT link_item_id #>> '{}' AS item_id,
           count(DISTINCT ${slides.deckId})::int AS deck_count
    FROM ${slides},
      LATERAL jsonb_path_query(${slides.blocks}, '$.**.link.itemId') AS link_item_id
    GROUP BY link_item_id
  `);

  // Drizzle's neon-http driver returns { rows }, the node-postgres driver an
  // array. Accept either rather than depending on which is configured.
  const rows = (Array.isArray(result) ? result : result?.rows ?? []) as Array<{
    item_id: string; deck_count: number;
  }>;

  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.item_id) map.set(row.item_id, Number(row.deck_count));
  }
  return map;
}

export async function getBlockLibraryItems(userId?: string): Promise<LibraryBlockItem[]> {
  const rows = await db
    .select({
      id: libraryItems.id,
      name: libraryItems.name,
      description: libraryItems.description,
      payload: libraryItems.payload,
      status: libraryItems.status,
      version: libraryItems.version,
      locked: libraryItems.locked,
      approvedBy: libraryItems.approvedBy,
      approvedAt: libraryItems.approvedAt,
      createdBy: libraryItems.createdBy,
      updatedBy: libraryItems.updatedBy,
      createdAt: libraryItems.createdAt,
      updatedAt: libraryItems.updatedAt,
    })
    .from(libraryItems)
    .where(eq(libraryItems.kind, "block"))
    .orderBy(desc(libraryItems.updatedAt));

  const ids = rows.map((row) => row.id);
  const peopleIds = rows.flatMap((row) => [row.createdBy, row.updatedBy, row.approvedBy]
    .filter((value): value is string => Boolean(value)));

  // Independent lookups — no reason to make them wait on each other.
  const [tagMap, favoriteIds, usage, people] = await Promise.all([
    getTaggingsFor("library_item", ids),
    userId ? getFavoriteIds(userId, "library_item") : Promise.resolve(new Set<string>()),
    getUsageCounts().catch((error) => {
      // A usage count is nice-to-have; it must never take the library page down.
      console.error("Failed to compute library usage counts", error);
      return new Map<string, number>();
    }),
    getUserSummaries(peopleIds),
  ]);

  return rows.map((row) => {
    const allTags = tagMap.get(row.id) ?? [];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      node: row.payload as Node,
      status: row.status as LibraryStatus,
      version: row.version,
      locked: row.locked,
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      author: people.get(row.createdBy) ?? null,
      editor: row.updatedBy ? people.get(row.updatedBy) ?? null : null,
      approver: row.approvedBy ? people.get(row.approvedBy) ?? null : null,
      tags: allTags.filter((tag) => tag.kind !== "category"),
      category: allTags.find((tag) => tag.kind === "category") ?? null,
      favorited: favoriteIds.has(row.id),
      usageCount: usage.get(row.id) ?? 0,
    };
  });
}

/** One item for the detail screen. Same shape as the list rows so the card and
 *  the detail page never drift apart. */
export async function getBlockLibraryItem(id: string, userId?: string): Promise<LibraryBlockItem | null> {
  const [row] = await db.select().from(libraryItems)
    .where(and(eq(libraryItems.id, id), eq(libraryItems.kind, "block"))).limit(1);
  if (!row) return null;

  const [tagMap, favoriteIds, usage, people] = await Promise.all([
    getTaggingsFor("library_item", [row.id]),
    userId ? getFavoriteIds(userId, "library_item") : Promise.resolve(new Set<string>()),
    getUsageCounts().catch(() => new Map<string, number>()),
    getUserSummaries([row.createdBy, row.updatedBy, row.approvedBy]
      .filter((value): value is string => Boolean(value))),
  ]);

  const allTags = tagMap.get(row.id) ?? [];
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    node: row.payload as Node,
    status: row.status as LibraryStatus,
    version: row.version,
    locked: row.locked,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    author: people.get(row.createdBy) ?? null,
    editor: row.updatedBy ? people.get(row.updatedBy) ?? null : null,
    approver: row.approvedBy ? people.get(row.approvedBy) ?? null : null,
    tags: allTags.filter((tag) => tag.kind !== "category"),
    category: allTags.find((tag) => tag.kind === "category") ?? null,
    favorited: favoriteIds.has(row.id),
    usageCount: usage.get(row.id) ?? 0,
  };
}
