import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { libraryItems, slides } from "@/lib/db/schema";
import type { Node } from "@/lib/slides/types";
import { getFavoriteIds, getTaggingsFor, type Tag } from "./taxonomy";

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
  const rows = await db.execute<{ item_id: string; deck_count: number }>(sql`
    SELECT link_item_id AS item_id, count(DISTINCT ${slides.deckId})::int AS deck_count
    FROM ${slides},
      LATERAL jsonb_path_query(${slides.blocks}, '$.blocks.**.link.itemId') AS link_item_id
    GROUP BY link_item_id
  `);

  const map = new Map<string, number>();
  for (const row of rows.rows ?? []) {
    // jsonb_path_query yields JSON scalars, so the id arrives quoted.
    map.set(String(row.item_id).replace(/^"|"$/g, ""), row.deck_count);
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

  // Three independent lookups — no reason to make them wait on each other.
  const [tagMap, favoriteIds, usage] = await Promise.all([
    getTaggingsFor("library_item", ids),
    userId ? getFavoriteIds(userId, "library_item") : Promise.resolve(new Set<string>()),
    getUsageCounts().catch((error) => {
      // A usage count is nice-to-have; it must never take the library page down.
      console.error("Failed to compute library usage counts", error);
      return new Map<string, number>();
    }),
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
      tags: allTags.filter((tag) => tag.kind !== "category"),
      category: allTags.find((tag) => tag.kind === "category") ?? null,
      favorited: favoriteIds.has(row.id),
      usageCount: usage.get(row.id) ?? 0,
    };
  });
}
