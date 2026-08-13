"use server";

/**
 * Companies library actions (LIBRARIES.md §4.1) — the update half of the
 * "super basic" v1 slice. Mirrors the guard()/try-catch/revalidatePath shape
 * in src/app/library/actions.ts so this stays a policy edit away from v2
 * (LIBRARIES.md §2.8), not a rewrite.
 *
 * Deliberately no hard delete: `decks.client_id` is `onDelete: "restrict"`,
 * so a company with any decks can never actually be deleted, and one without
 * decks is better served by the existing archive column (already read by
 * getCompanies()) than by a destructive action with an unhelpful failure
 * mode. Archive/unarchive covers "get this out of my company list."
 */
import { auth } from "@clerk/nextjs/server";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { can } from "@/lib/auth/policy";
import { slugify } from "@/lib/slug";

export type ManageCompanyResult =
  | { status: "complete"; message?: string }
  | { status: "error"; message: string };

function validId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type Guard = { ok: true; userId: string } | { ok: false; error: string };

async function guard(id: string, capability: Parameters<typeof can>[1]): Promise<Guard> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Your session expired. Sign in again." };
  if (!validId(id)) return { ok: false, error: "That company is invalid." };
  // Role lookup lands with v2; every actor is an editor until then.
  if (!can({ userId, role: "editor" }, capability)) {
    return { ok: false, error: "You do not have permission to do that." };
  }
  return { ok: true, userId };
}

function cleanUrl(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

export async function updateCompanyAction(input: {
  id: string;
  name: string;
  slug: string;
  website: string;
  industry: string;
  logoUrl: string;
  logoDarkUrl: string;
  logoMarkUrl: string;
  brandPrimary: string;
  brandSecondary: string;
  bitrixId: string;
  airtableBaseId: string;
  airtableTableId: string;
  airtableRecordId: string;
  notes: string;
}): Promise<ManageCompanyResult> {
  const gate = await guard(input.id, "company.edit");
  if (!gate.ok) return { status: "error", message: gate.error };

  const name = input.name.trim();
  if (!name) return { status: "error", message: "Give this company a name." };
  if (name.length > 150) return { status: "error", message: "Names must be 150 characters or fewer." };

  const slug = slugify(input.slug) || slugify(name);
  if (!slug) return { status: "error", message: "That slug leaves nothing usable — try a different one." };

  try {
    const clash = await db.select({ id: clients.id }).from(clients)
      .where(and(eq(clients.slug, slug), ne(clients.id, input.id)))
      .limit(1);
    if (clash.length) {
      return { status: "error", message: `“${slug}” is already used by another company.` };
    }

    const updated = await db.update(clients)
      .set({
        name,
        slug,
        website: cleanUrl(input.website),
        industry: cleanUrl(input.industry),
        logoUrl: cleanUrl(input.logoUrl),
        logoDarkUrl: cleanUrl(input.logoDarkUrl),
        logoMarkUrl: cleanUrl(input.logoMarkUrl),
        brandPrimary: cleanUrl(input.brandPrimary),
        brandSecondary: cleanUrl(input.brandSecondary),
        bitrixId: cleanUrl(input.bitrixId),
        airtableBaseId: cleanUrl(input.airtableBaseId),
        airtableTableId: cleanUrl(input.airtableTableId),
        airtableRecordId: cleanUrl(input.airtableRecordId),
        notes: cleanUrl(input.notes),
        updatedAt: new Date(),
      })
      .where(eq(clients.id, input.id))
      .returning({ id: clients.id });
    if (!updated.length) return { status: "error", message: "That company no longer exists." };

    revalidatePath("/companies");
    revalidatePath(`/companies/${input.id}`);
    return { status: "complete", message: "Saved." };
  } catch (error) {
    console.error("Failed to update company", error);
    return { status: "error", message: "That change did not save. Try again." };
  }
}

export async function setCompanyArchivedAction(input: { id: string; archived: boolean }): Promise<ManageCompanyResult> {
  const gate = await guard(input.id, "company.delete");
  if (!gate.ok) return { status: "error", message: gate.error };

  try {
    const updated = await db.update(clients)
      .set({ archivedAt: input.archived ? new Date() : null, updatedAt: new Date() })
      .where(eq(clients.id, input.id))
      .returning({ id: clients.id });
    if (!updated.length) return { status: "error", message: "That company no longer exists." };

    revalidatePath("/companies");
    revalidatePath(`/companies/${input.id}`);
    return {
      status: "complete",
      message: input.archived
        ? "Archived. It no longer appears in the companies list."
        : "Restored to the companies list.",
    };
  } catch (error) {
    console.error("Failed to archive company", error);
    return { status: "error", message: "That change did not save. Try again." };
  }
}
