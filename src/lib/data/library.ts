import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { libraryItems } from "@/lib/db/schema";
import type { Node } from "@/lib/slides/types";

export type LibraryBlockItem = {
  id: string;
  name: string;
  node: Node;
  createdAt: string;
  updatedAt: string;
};

export async function getBlockLibraryItems(): Promise<LibraryBlockItem[]> {
  const rows = await db
    .select({
      id: libraryItems.id,
      name: libraryItems.name,
      payload: libraryItems.payload,
      createdAt: libraryItems.createdAt,
      updatedAt: libraryItems.updatedAt,
    })
    .from(libraryItems)
    .where(eq(libraryItems.kind, "block"))
    .orderBy(desc(libraryItems.updatedAt));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    node: row.payload as Node,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}
