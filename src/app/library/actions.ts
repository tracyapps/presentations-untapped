"use server";

import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { libraryItems } from "@/lib/db/schema";

export type ManageLibraryResult =
  | { status: "complete"; name?: string }
  | { status: "error"; message: string };

function validId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function renameLibraryItemAction(input: { id: string; name: string }): Promise<ManageLibraryResult> {
  const { userId } = await auth();
  if (!userId) return { status: "error", message: "Your session expired. Sign in again." };
  if (!validId(input.id)) return { status: "error", message: "That library item is invalid." };
  const name = input.name.trim();
  if (!name) return { status: "error", message: "Give this library block a name." };
  if (name.length > 100) return { status: "error", message: "Library names must be 100 characters or fewer." };

  try {
    const updated = await db
      .update(libraryItems)
      .set({ name, updatedAt: new Date() })
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

export async function deleteLibraryItemAction(id: string): Promise<ManageLibraryResult> {
  const { userId } = await auth();
  if (!userId) return { status: "error", message: "Your session expired. Sign in again." };
  if (!validId(id)) return { status: "error", message: "That library item is invalid." };

  try {
    const deleted = await db
      .delete(libraryItems)
      .where(and(eq(libraryItems.id, id), eq(libraryItems.kind, "block")))
      .returning({ id: libraryItems.id });
    if (!deleted.length) return { status: "error", message: "That library block no longer exists." };
    revalidatePath("/library");
    return { status: "complete" };
  } catch (error) {
    console.error("Failed to delete library item", error);
    return { status: "error", message: "The library block could not be deleted. Try again." };
  }
}
