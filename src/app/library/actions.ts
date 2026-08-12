"use server";

import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { libraryItems } from "@/lib/db/schema";
import { can } from "@/lib/auth/policy";
import {
  applyTags, ensureTag, sweepTaggings, toggleFavorite,
  type TagKind,
} from "@/lib/data/taxonomy";

export type ManageLibraryResult =
  | { status: "complete"; name?: string; message?: string }
  | { status: "error"; message: string };

function validId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** Every action starts here: a session, valid ids, and the capability check.
 *  `can()` returns true for everything in v1 — the call sites exist so v2 is a
 *  policy edit rather than an audit of every action (LIBRARIES.md §2.8). */
type Guard = { ok: true; userId: string } | { ok: false; error: string };

async function guard(ids: string[], capability: Parameters<typeof can>[1]): Promise<Guard> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Your session expired. Sign in again." };
  if (!ids.length) return { ok: false, error: "Nothing was selected." };
  if (ids.some((id) => !validId(id))) return { ok: false, error: "That library item is invalid." };
  // Role lookup lands with v2; every actor is an editor until then.
  if (!can({ userId, role: "editor" }, capability)) {
    return { ok: false, error: "You do not have permission to do that." };
  }
  return { ok: true, userId };
}

/* ---------------------------- Single item ---------------------------- */

export async function renameLibraryItemAction(input: { id: string; name: string }): Promise<ManageLibraryResult> {
  const gate = await guard([input.id], "library.edit");
  if (!gate.ok) return { status: "error", message: gate.error };

  const name = input.name.trim();
  if (!name) return { status: "error", message: "Give this library block a name." };
  if (name.length > 100) return { status: "error", message: "Library names must be 100 characters or fewer." };

  try {
    const updated = await db.update(libraryItems)
      .set({ name, updatedBy: gate.userId, updatedAt: new Date() })
      .where(and(eq(libraryItems.id, input.id), eq(libraryItems.kind, "block")))
      .returning({ id: libraryItems.id });
    if (!updated.length) return { status: "error", message: "That library block no longer exists." };
    revalidatePath("/library");
    return { status: "complete", name };
  } catch (error) {
    console.error("Failed to rename library item", error);
    return { status: "error", message: "The library block could not be renamed. Try again." };
  }
}

export async function toggleFavoriteAction(id: string): Promise<ManageLibraryResult> {
  const gate = await guard([id], "library.edit");
  if (!gate.ok) return { status: "error", message: gate.error };

  try {
    const { favorited } = await toggleFavorite({
      userId: gate.userId, subjectType: "library_item", subjectId: id,
    });
    revalidatePath("/library");
    return { status: "complete", message: favorited ? "Added to your favorites." : "Removed from your favorites." };
  } catch (error) {
    console.error("Failed to toggle favorite", error);
    return { status: "error", message: "That favorite could not be saved. Try again." };
  }
}

/* ----------------------------- Bulk actions --------------------------- */

export async function setLibraryStatusAction(
  input: { ids: string[]; status: "draft" | "in_review" | "approved" },
): Promise<ManageLibraryResult> {
  const capability = input.status === "approved" ? "library.approve" : "library.edit";
  const gate = await guard(input.ids, capability);
  if (!gate.ok) return { status: "error", message: gate.error };

  try {
    const approving = input.status === "approved";
    const updated = await db.update(libraryItems)
      .set({
        status: input.status,
        approvedBy: approving ? gate.userId : null,
        approvedAt: approving ? new Date() : null,
        updatedBy: gate.userId,
        updatedAt: new Date(),
      })
      .where(and(inArray(libraryItems.id, input.ids), eq(libraryItems.kind, "block")))
      .returning({ id: libraryItems.id });

    revalidatePath("/library");
    const label = input.status === "in_review" ? "in review" : input.status;
    return {
      status: "complete",
      message: `${updated.length} ${updated.length === 1 ? "block" : "blocks"} marked ${label}.`,
    };
  } catch (error) {
    console.error("Failed to set library status", error);
    return { status: "error", message: "That status change did not save. Nothing was changed." };
  }
}

export async function deleteLibraryItemsAction(ids: string[]): Promise<ManageLibraryResult> {
  const gate = await guard(ids, "library.delete");
  if (!gate.ok) return { status: "error", message: gate.error };

  try {
    // A locked block cannot be deleted even in v1 — the flag is stored now, and
    // honouring it here costs nothing and prevents a nasty v2 surprise.
    const locked = await db.select({ id: libraryItems.id, name: libraryItems.name })
      .from(libraryItems)
      .where(and(inArray(libraryItems.id, ids), eq(libraryItems.locked, true)));
    if (locked.length) {
      return { status: "error", message: `Locked: ${locked.map((row) => row.name).join(", ")}. Unlock before deleting.` };
    }

    const deleted = await db.delete(libraryItems)
      .where(and(inArray(libraryItems.id, ids), eq(libraryItems.kind, "block")))
      .returning({ id: libraryItems.id });

    // No FK on subject_id, so orphan taggings and favorites are ours to clear.
    await sweepTaggings("library_item", deleted.map((row) => row.id));

    revalidatePath("/library");
    return {
      status: "complete",
      message: `Deleted ${deleted.length} ${deleted.length === 1 ? "block" : "blocks"}. Slides already using them are unaffected.`,
    };
  } catch (error) {
    console.error("Failed to delete library items", error);
    return { status: "error", message: "Those blocks could not be deleted. Nothing was changed." };
  }
}

export async function tagLibraryItemsAction(
  input: { ids: string[]; tagName: string; kind: TagKind },
): Promise<ManageLibraryResult> {
  const gate = await guard(input.ids, "library.edit");
  if (!gate.ok) return { status: "error", message: gate.error };

  const name = input.tagName.trim();
  if (!name) return { status: "error", message: "Type a name for the tag." };
  if (name.length > 60) return { status: "error", message: "Tag names must be 60 characters or fewer." };

  try {
    const tag = await ensureTag({ name, kind: input.kind, createdBy: gate.userId });
    await applyTags({
      subjectType: "library_item", subjectIds: input.ids,
      tagIds: [tag.id], createdBy: gate.userId,
    });
    revalidatePath("/library");
    const noun = input.kind === "category" ? "Categorized" : "Tagged";
    return {
      status: "complete",
      message: `${noun} ${input.ids.length} ${input.ids.length === 1 ? "block" : "blocks"} as “${tag.name}”.`,
    };
  } catch (error) {
    console.error("Failed to tag library items", error);
    return { status: "error", message: "That tag could not be applied. Nothing was changed." };
  }
}

/** Kept for the single-item delete path still used by older call sites. */
export async function deleteLibraryItemAction(id: string): Promise<ManageLibraryResult> {
  return deleteLibraryItemsAction([id]);
}
