"use server";

import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { clients, decks, events, slides } from "@/lib/db/schema";
import { layoutByKey } from "@/lib/slides/layouts";
import { slugify } from "@/lib/slug";

export type CreateDeckState = { error: string } | null;

async function availableClientSlug(base: string): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while ((await db.select({ id: clients.id }).from(clients).where(eq(clients.slug, candidate)).limit(1)).length) {
    candidate = `${base}-${suffix++}`;
  }
  return candidate;
}

async function availableDeckSlug(clientId: string, base: string): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while ((await db.select({ id: decks.id }).from(decks).where(and(eq(decks.clientId, clientId), eq(decks.slug, candidate))).limit(1)).length) {
    candidate = `${base}-${suffix++}`;
  }
  return candidate;
}

export async function createDeckAction(
  _previousState: CreateDeckState,
  formData: FormData,
): Promise<CreateDeckState> {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn({ returnBackUrl: "/decks/new" });

  const title = String(formData.get("title") ?? "").trim();
  const selectedClientId = String(formData.get("clientId") ?? "").trim();
  const newClientName = String(formData.get("newClientName") ?? "").trim();
  const eventName = String(formData.get("eventName") ?? "").trim();
  const theme = formData.get("themeDefault") === "dark" ? "dark" : "light";

  if (!title) return { error: "Enter a deck title." };
  if (!selectedClientId && !newClientName) return { error: "Choose a client or create a new one." };
  if (selectedClientId && newClientName) return { error: "Choose an existing client or create a new one, not both." };

  const clientId = selectedClientId || crypto.randomUUID();
  const deckId = crypto.randomUUID();
  const slideId = crypto.randomUUID();
  const eventId = eventName ? crypto.randomUUID() : null;
  const starter = layoutByKey("title-paragraph")?.build();
  if (!starter) return { error: "The starter slide layout is unavailable." };

  if (selectedClientId) {
    const existing = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, selectedClientId)).limit(1);
    if (!existing.length) return { error: "That client no longer exists. Refresh and choose again." };
  }

  const deckSlug = await availableDeckSlug(clientId, slugify(title) || "untitled-deck");

  try {
    const deckValues = {
      id: deckId,
      clientId,
      eventId,
      title,
      slug: deckSlug,
      themeDefault: theme,
      createdBy: userId,
    } as const;
    const slideValues = {
      id: slideId,
      deckId,
      position: 1,
      layoutKey: "title-paragraph",
      blocks: starter,
    } as const;

    if (newClientName) {
      const clientSlug = await availableClientSlug(slugify(newClientName) || "client");
      if (eventId) {
        await db.batch([
          db.insert(clients).values({ id: clientId, name: newClientName, slug: clientSlug }),
          db.insert(events).values({ id: eventId, clientId, name: eventName }),
          db.insert(decks).values(deckValues),
          db.insert(slides).values(slideValues),
        ]);
      } else {
        await db.batch([
          db.insert(clients).values({ id: clientId, name: newClientName, slug: clientSlug }),
          db.insert(decks).values(deckValues),
          db.insert(slides).values(slideValues),
        ]);
      }
    } else if (eventId) {
      await db.batch([
        db.insert(events).values({ id: eventId, clientId, name: eventName }),
        db.insert(decks).values(deckValues),
        db.insert(slides).values(slideValues),
      ]);
    } else {
      await db.batch([
        db.insert(decks).values(deckValues),
        db.insert(slides).values(slideValues),
      ]);
    }
  } catch (error) {
    console.error("Failed to create deck", error);
    return { error: "The deck could not be created. Check the details and try again." };
  }

  redirect("/decks");
}
