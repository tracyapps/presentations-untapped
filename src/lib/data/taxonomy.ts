/**
 * The shared taxonomy — one tag system across blocks, slides, media, and
 * companies (LIBRARIES.md §2.2).
 *
 * Written once here so every library gets the same tag picker, the same filter
 * builder, and the same bulk-tag action. The cost of the polymorphic
 * subject_type/subject_id pair is no FK on subject_id; `sweepTaggings` below is
 * how delete actions pay that cost.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { favorites, taggings, tags } from "@/lib/db/schema";

export type TagKind = "category" | "tag" | "person";
export type SubjectType = "library_item" | "media_asset" | "client";

export type Tag = {
  id: string;
  kind: TagKind;
  name: string;
  slug: string;
  color: string | null;
  description: string | null;
};

/** A tag plus how many things carry it — drives the filter menu's counts, which
 *  are what stop people picking a filter that returns nothing. */
export type TagWithCount = Tag & { count: number };

export function slugifyTag(name: string): string {
  return name.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/* ----------------------------- Reads ------------------------------ */

export async function getTags(kind?: TagKind): Promise<Tag[]> {
  const rows = await db.select().from(tags)
    .where(kind ? eq(tags.kind, kind) : undefined)
    .orderBy(tags.kind, tags.name);
  return rows.map(toTag);
}

/** Tags in use for one library, with counts scoped to that library. */
export async function getTagsForSubject(subjectType: SubjectType): Promise<TagWithCount[]> {
  const rows = await db
    .select({
      id: tags.id, kind: tags.kind, name: tags.name, slug: tags.slug,
      color: tags.color, description: tags.description,
      count: sql<number>`count(${taggings.id})::int`,
    })
    .from(tags)
    .leftJoin(taggings, and(eq(taggings.tagId, tags.id), eq(taggings.subjectType, subjectType)))
    .groupBy(tags.id)
    .orderBy(tags.kind, tags.name);

  return rows.map((row) => ({ ...toTag(row), count: row.count ?? 0 }));
}

/** Tag ids per subject id, for a page of items. One query, not one per row. */
export async function getTaggingsFor(
  subjectType: SubjectType,
  subjectIds: string[],
): Promise<Map<string, Tag[]>> {
  const map = new Map<string, Tag[]>();
  if (!subjectIds.length) return map;

  const rows = await db
    .select({
      subjectId: taggings.subjectId,
      id: tags.id, kind: tags.kind, name: tags.name, slug: tags.slug,
      color: tags.color, description: tags.description,
    })
    .from(taggings)
    .innerJoin(tags, eq(tags.id, taggings.tagId))
    .where(and(eq(taggings.subjectType, subjectType), inArray(taggings.subjectId, subjectIds)))
    .orderBy(tags.kind, tags.name);

  for (const row of rows) {
    const list = map.get(row.subjectId) ?? [];
    list.push(toTag(row));
    map.set(row.subjectId, list);
  }
  return map;
}

/* ----------------------------- Writes ----------------------------- */

/** Finds or creates a tag by name. Case- and punctuation-insensitive via the
 *  slug, so "Case Study", "case study", and "case-study" are one tag rather
 *  than the three-way split that makes libraries unusable. */
export async function ensureTag(
  input: { name: string; kind: TagKind; color?: string; createdBy: string },
): Promise<Tag> {
  const slug = slugifyTag(input.name);
  if (!slug) throw new Error("A tag needs at least one letter or number.");

  const [existing] = await db.select().from(tags)
    .where(and(eq(tags.slug, slug), eq(tags.kind, input.kind))).limit(1);
  if (existing) return toTag(existing);

  const [created] = await db.insert(tags).values({
    name: input.name.trim(), slug, kind: input.kind,
    color: input.color ?? null, createdBy: input.createdBy,
  }).returning();
  return toTag(created);
}

/** Attaches tags, skipping duplicates. `category` is single-select: applying one
 *  replaces any existing category on that subject (LIBRARIES.md §2.2). */
export async function applyTags(input: {
  subjectType: SubjectType;
  subjectIds: string[];
  tagIds: string[];
  createdBy: string;
}): Promise<void> {
  if (!input.subjectIds.length || !input.tagIds.length) return;

  const chosen = await db.select().from(tags).where(inArray(tags.id, input.tagIds));
  const categoryIds = chosen.filter((t) => t.kind === "category").map((t) => t.id);

  if (categoryIds.length) {
    const existingCategories = await db
      .select({ id: taggings.id })
      .from(taggings)
      .innerJoin(tags, eq(tags.id, taggings.tagId))
      .where(and(
        eq(taggings.subjectType, input.subjectType),
        inArray(taggings.subjectId, input.subjectIds),
        eq(tags.kind, "category"),
      ));
    if (existingCategories.length) {
      await db.delete(taggings).where(inArray(taggings.id, existingCategories.map((r) => r.id)));
    }
  }

  const rows = input.subjectIds.flatMap((subjectId) =>
    input.tagIds.map((tagId) => ({
      tagId, subjectId, subjectType: input.subjectType, createdBy: input.createdBy,
    })),
  );
  await db.insert(taggings).values(rows).onConflictDoNothing();
}

/** Tag ids currently on one subject. Used by the detail screen's tag editor,
 *  which replaces the whole set rather than adding to it. */
export async function getTagsForSubjectId(subjectType: SubjectType, subjectId: string): Promise<string[]> {
  const rows = await db.select({ tagId: taggings.tagId }).from(taggings)
    .where(and(eq(taggings.subjectType, subjectType), eq(taggings.subjectId, subjectId)));
  return rows.map((row) => row.tagId);
}

export async function removeTags(input: {
  subjectType: SubjectType;
  subjectIds: string[];
  tagIds: string[];
}): Promise<void> {
  if (!input.subjectIds.length || !input.tagIds.length) return;
  await db.delete(taggings).where(and(
    eq(taggings.subjectType, input.subjectType),
    inArray(taggings.subjectId, input.subjectIds),
    inArray(taggings.tagId, input.tagIds),
  ));
}

/** Call from every delete action. Without an FK on subject_id, this is the only
 *  thing stopping taggings and favorites accumulating rows pointing at nothing. */
export async function sweepTaggings(subjectType: SubjectType, subjectIds: string[]): Promise<void> {
  if (!subjectIds.length) return;
  await db.delete(taggings).where(and(
    eq(taggings.subjectType, subjectType), inArray(taggings.subjectId, subjectIds),
  ));
  await db.delete(favorites).where(and(
    eq(favorites.subjectType, subjectType), inArray(favorites.subjectId, subjectIds),
  ));
}

/* ---------------------------- Favorites ---------------------------- */

export async function getFavoriteIds(userId: string, subjectType: SubjectType): Promise<Set<string>> {
  const rows = await db.select({ subjectId: favorites.subjectId }).from(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.subjectType, subjectType)));
  return new Set(rows.map((row) => row.subjectId));
}

/** Returns the resulting state so the caller can announce it rather than
 *  guessing at the toggle's outcome. */
export async function toggleFavorite(input: {
  userId: string; subjectType: SubjectType; subjectId: string;
}): Promise<{ favorited: boolean }> {
  const deleted = await db.delete(favorites).where(and(
    eq(favorites.userId, input.userId),
    eq(favorites.subjectType, input.subjectType),
    eq(favorites.subjectId, input.subjectId),
  )).returning({ id: favorites.id });

  if (deleted.length) return { favorited: false };

  await db.insert(favorites).values(input).onConflictDoNothing();
  return { favorited: true };
}

/* ----------------------------- Helper ----------------------------- */

function toTag(row: {
  id: string; kind: string; name: string; slug: string;
  color: string | null; description: string | null;
}): Tag {
  return {
    id: row.id, kind: row.kind as TagKind, name: row.name,
    slug: row.slug, color: row.color, description: row.description,
  };
}
