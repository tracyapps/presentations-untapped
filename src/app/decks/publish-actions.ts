"use server";

/**
 * The review and publishing flow (PLAN.md §5.7).
 *
 *   draft → in_review → approved
 *
 * Approving sets `published_at` and makes the deck live at
 * /p/[clientSlug]/[deckSlug]. Moving back to draft 404s that URL immediately —
 * which is the un-publish path, and why it confirms first.
 */
import { auth } from "@clerk/nextjs/server";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { clients, decks, events, slides } from "@/lib/db/schema";
import { can } from "@/lib/auth/policy";
import { describeIssues, findPublishIssues } from "@/lib/publish";
import type { SlideDoc } from "@/lib/slides/types";

export type DeckStatus = "draft" | "in_review" | "approved";

export type PublishResult =
  | { status: "complete"; message: string; publicUrl?: string }
  | { status: "blocked"; message: string; issues: string }
  | { status: "error"; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Where a published deck lives. Kept here so the action, the editor banner,
 *  and the OG tags cannot drift apart. */
export async function publicDeckPath(clientSlug: string, deckSlug: string): Promise<string> {
  return `/p/${clientSlug}/${deckSlug}`;
}

export async function setDeckStatusAction(
  input: { deckId: string; status: DeckStatus; force?: boolean },
): Promise<PublishResult> {
  const { userId } = await auth();
  if (!userId) return { status: "error", message: "Your session expired. Sign in again." };
  if (!UUID.test(input.deckId)) return { status: "error", message: "That deck is invalid." };
  if (!can({ userId, role: "editor" }, "deck.publish")) {
    return { status: "error", message: "You do not have permission to publish." };
  }

  try {
    const [deck] = await db
      .select({
        id: decks.id,
        title: decks.title,
        slug: decks.slug,
        status: decks.status,
        clientName: clients.name,
        clientSlug: clients.slug,
        clientWebsite: clients.website,
        clientIndustry: clients.industry,
        eventName: events.name,
      })
      .from(decks)
      .innerJoin(clients, eq(decks.clientId, clients.id))
      .leftJoin(events, eq(decks.eventId, events.id))
      .where(eq(decks.id, input.deckId))
      .limit(1);

    if (!deck) return { status: "error", message: "That deck no longer exists." };

    // Only approving runs the checks — moving to draft or review is always safe.
    if (input.status === "approved" && !input.force) {
      const slideRows = await db
        .select({ position: slides.position, blocks: slides.blocks })
        .from(slides)
        .where(eq(slides.deckId, input.deckId))
        .orderBy(asc(slides.position));

      if (!slideRows.length) {
        return { status: "error", message: "This deck has no slides yet." };
      }

      const issues = findPublishIssues(
        slideRows as Array<{ position: number; blocks: SlideDoc }>,
        {
          company: {
            name: deck.clientName,
            website: deck.clientWebsite ?? undefined,
            industry: deck.clientIndustry ?? undefined,
          },
          event: deck.eventName ? { name: deck.eventName } : undefined,
          deck: { title: deck.title },
        },
      );

      if (issues.length) {
        return {
          status: "blocked",
          message: `${issues.length} ${issues.length === 1 ? "thing needs" : "things need"} attention before this goes to a client.`,
          issues: describeIssues(issues),
        };
      }
    }

    const approving = input.status === "approved";
    await db.update(decks)
      .set({
        status: input.status,
        // Un-approving clears the timestamp, so the public route 404s and the
        // deck cannot half-exist as "not approved but still published".
        publishedAt: approving ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(decks.id, input.deckId));

    revalidatePath("/decks");
    revalidatePath(`/decks/${input.deckId}/edit`, "layout");
    const path = await publicDeckPath(deck.clientSlug, deck.slug);
    revalidatePath(path);

    if (approving) {
      return { status: "complete", message: "Approved and published.", publicUrl: path };
    }
    return {
      status: "complete",
      message: input.status === "in_review"
        ? "Sent for review."
        : "Moved back to draft. The public link now returns a 404.",
    };
  } catch (error) {
    console.error("Failed to change deck status", error);
    return { status: "error", message: "That status change did not save. Nothing was changed." };
  }
}

/** Rename the public slug before approving. The pairing of client + deck slug
 *  is unique, so a collision is a real, reportable error rather than a silent
 *  overwrite of somebody else's URL. */
export async function setDeckSlugAction(
  input: { deckId: string; slug: string },
): Promise<PublishResult> {
  const { userId } = await auth();
  if (!userId) return { status: "error", message: "Your session expired. Sign in again." };
  if (!UUID.test(input.deckId)) return { status: "error", message: "That deck is invalid." };

  const slug = input.slug.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  if (!slug) return { status: "error", message: "The link needs at least one letter or number." };

  try {
    const [deck] = await db.select({ clientId: decks.clientId })
      .from(decks).where(eq(decks.id, input.deckId)).limit(1);
    if (!deck) return { status: "error", message: "That deck no longer exists." };

    const [clash] = await db.select({ id: decks.id }).from(decks)
      .where(and(eq(decks.clientId, deck.clientId), eq(decks.slug, slug)))
      .limit(1);
    if (clash && clash.id !== input.deckId) {
      return { status: "error", message: `This client already has a deck at “${slug}”. Pick another link.` };
    }

    await db.update(decks).set({ slug, updatedAt: new Date() }).where(eq(decks.id, input.deckId));
    revalidatePath("/decks");
    revalidatePath(`/decks/${input.deckId}/edit`, "layout");
    return { status: "complete", message: `Public link is now /${slug}.` };
  } catch (error) {
    console.error("Failed to set deck slug", error);
    return { status: "error", message: "That link could not be saved." };
  }
}
