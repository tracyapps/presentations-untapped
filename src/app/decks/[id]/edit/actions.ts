"use server";

import { auth } from "@clerk/nextjs/server";
import { and, asc, eq, gt, gte, lt, max, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { decks, libraryItems, slides } from "@/lib/db/schema";
import { layoutByKey } from "@/lib/slides/layouts";
import { cloneDoc } from "@/lib/slides/editor";
import type { LibraryBlockItem } from "@/lib/data/library";
import type { Node, SlideDoc } from "@/lib/slides/types";

export type SaveSlideResult =
  | { status: "saved"; updatedAt: string }
  | { status: "conflict"; message: string }
  | { status: "error"; message: string };

export type SaveLibraryItemResult =
  | { status: "saved"; item: LibraryBlockItem }
  | { status: "error"; message: string };

const contentTypes = new Set([
  "title", "tagline", "blockquote", "callout", "paragraph", "image", "list",
  "process", "statCard", "table", "pricingTable", "chart",
]);
const layoutTypes = new Set(["row", "columns", "grid", "group"]);

function isNode(value: unknown, depth = 0): value is Node {
  if (!value || typeof value !== "object" || depth > 12) return false;
  const node = value as Record<string, unknown>;
  if (typeof node.id !== "string" || node.id.length > 80 || typeof node.type !== "string") return false;
  if (node.kind === "layout") {
    return layoutTypes.has(node.type) && Array.isArray(node.children)
      && node.children.length <= 100
      && node.children.every((child) => isNode(child, depth + 1));
  }
  return node.kind === "content" && contentTypes.has(node.type)
    && !!node.props && typeof node.props === "object";
}

function isSlideDoc(value: unknown): value is SlideDoc {
  if (!value || typeof value !== "object") return false;
  const doc = value as Record<string, unknown>;
  return doc.version === 1 && Array.isArray(doc.blocks)
    && doc.blocks.length <= 100
    && doc.blocks.every((node) => isNode(node));
}

export async function saveBlockToLibraryAction(input: {
  name: string;
  node: Node;
}): Promise<SaveLibraryItemResult> {
  const { userId } = await auth();
  if (!userId) return { status: "error", message: "Your session expired. Sign in again to save library items." };

  const name = input.name.trim();
  if (!name) return { status: "error", message: "Give this library block a name." };
  if (name.length > 100) return { status: "error", message: "Library names must be 100 characters or fewer." };
  if (!isNode(input.node) || JSON.stringify(input.node).length > 200_000) {
    return { status: "error", message: "This block cannot be saved because its content is invalid or too large." };
  }

  try {
    const [saved] = await db.insert(libraryItems).values({
      kind: "block",
      name,
      payload: input.node,
      createdBy: userId,
    }).returning({ id: libraryItems.id, createdAt: libraryItems.createdAt, updatedAt: libraryItems.updatedAt });
    revalidatePath("/library");
    return {
      status: "saved",
      item: {
        id: saved.id,
        name,
        node: input.node,
        createdAt: saved.createdAt.toISOString(),
        updatedAt: saved.updatedAt.toISOString(),
      },
    };
  } catch (error) {
    console.error("Failed to save library block", error);
    return { status: "error", message: "The block could not be saved to the library. Try again." };
  }
}

export async function saveSlideAction(input: {
  deckId: string;
  slideId: string;
  expectedUpdatedAt: string;
  layoutKey: string;
  blocks: SlideDoc;
}): Promise<SaveSlideResult> {
  const { userId } = await auth();
  if (!userId) return { status: "error", message: "Your session expired. Sign in again to save." };
  if (!isSlideDoc(input.blocks) || JSON.stringify(input.blocks).length > 500_000) {
    return { status: "error", message: "This slide contains invalid or oversized content." };
  }
  if (!layoutByKey(input.layoutKey)) return { status: "error", message: "Choose a valid slide layout." };

  const expected = new Date(input.expectedUpdatedAt);
  if (Number.isNaN(expected.getTime())) return { status: "error", message: "The slide version is invalid. Refresh and try again." };
  // Postgres defaults to microsecond precision while JavaScript Date only
  // carries milliseconds. Match the exact millisecond bucket returned to the
  // browser so a fresh row is not mistaken for a concurrent edit.
  const expectedNextMillisecond = new Date(expected.getTime() + 1);

  const now = new Date();
  const updated = await db
    .update(slides)
    .set({ blocks: input.blocks, layoutKey: input.layoutKey, updatedAt: now })
    .where(and(
      eq(slides.id, input.slideId),
      eq(slides.deckId, input.deckId),
      gte(slides.updatedAt, expected),
      lt(slides.updatedAt, expectedNextMillisecond),
    ))
    .returning({ updatedAt: slides.updatedAt });

  if (!updated.length) {
    return {
      status: "conflict",
      message: "This slide changed after you opened it. Refresh before saving so you do not overwrite someone else’s work.",
    };
  }

  await db.update(decks).set({ updatedAt: now }).where(eq(decks.id, input.deckId));
  revalidatePath("/decks");
  revalidatePath(`/decks/${input.deckId}/edit`);
  return { status: "saved", updatedAt: updated[0].updatedAt.toISOString() };
}

export type AddSlideResult =
  | { status: "created"; position: number }
  | { status: "error"; message: string };

export async function addSlideAction(deckId: string): Promise<AddSlideResult> {
  const { userId } = await auth();
  if (!userId) return { status: "error", message: "Your session expired. Sign in again." };

  const [deck] = await db.select({ id: decks.id }).from(decks).where(eq(decks.id, deckId)).limit(1);
  if (!deck) return { status: "error", message: "This deck no longer exists." };

  const [last] = await db
    .select({ position: max(slides.position) })
    .from(slides)
    .where(eq(slides.deckId, deckId));
  const position = (last?.position ?? 0) + 1;
  const starter = layoutByKey("title-paragraph")?.build();
  if (!starter) return { status: "error", message: "The starter layout is unavailable." };

  const now = new Date();
  await db.batch([
    db.insert(slides).values({ deckId, position, layoutKey: "title-paragraph", blocks: starter }),
    db.update(decks).set({ updatedAt: now }).where(eq(decks.id, deckId)),
  ]);
  revalidatePath("/decks");
  revalidatePath(`/decks/${deckId}/edit`);
  return { status: "created", position };
}

export type ManageSlideResult =
  | { status: "complete"; position: number }
  | { status: "error"; message: string };

export async function duplicateSlideAction(deckId: string, slideId: string): Promise<ManageSlideResult> {
  const { userId } = await auth();
  if (!userId) return { status: "error", message: "Your session expired. Sign in again." };

  const [source] = await db
    .select({ blocks: slides.blocks, layoutKey: slides.layoutKey })
    .from(slides)
    .where(and(eq(slides.id, slideId), eq(slides.deckId, deckId)))
    .limit(1);
  if (!source) return { status: "error", message: "This slide no longer exists." };

  const [last] = await db.select({ position: max(slides.position) }).from(slides).where(eq(slides.deckId, deckId));
  const position = (last?.position ?? 0) + 1;
  const now = new Date();
  await db.batch([
    db.insert(slides).values({ deckId, position, layoutKey: source.layoutKey, blocks: cloneDoc(source.blocks) }),
    db.update(decks).set({ updatedAt: now }).where(eq(decks.id, deckId)),
  ]);
  revalidatePath("/decks");
  revalidatePath(`/decks/${deckId}/edit`);
  return { status: "complete", position };
}

export async function deleteSlideAction(deckId: string, slideId: string): Promise<ManageSlideResult> {
  const { userId } = await auth();
  if (!userId) return { status: "error", message: "Your session expired. Sign in again." };

  const deckSlides = await db
    .select({ id: slides.id, position: slides.position })
    .from(slides)
    .where(eq(slides.deckId, deckId))
    .orderBy(asc(slides.position));
  const current = deckSlides.find((slide) => slide.id === slideId);
  if (!current) return { status: "error", message: "This slide no longer exists." };
  if (deckSlides.length === 1) return { status: "error", message: "A deck must keep at least one slide." };

  const now = new Date();
  await db.batch([
    db.delete(slides).where(and(eq(slides.id, slideId), eq(slides.deckId, deckId))),
    db.update(slides)
      .set({ position: sql`${slides.position} - 1` })
      .where(and(eq(slides.deckId, deckId), gt(slides.position, current.position))),
    db.update(decks).set({ updatedAt: now }).where(eq(decks.id, deckId)),
  ]);
  revalidatePath("/decks");
  revalidatePath(`/decks/${deckId}/edit`);
  return { status: "complete", position: Math.min(current.position, deckSlides.length - 1) };
}
