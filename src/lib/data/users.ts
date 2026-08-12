/**
 * Display names for the Clerk user ids stored on rows (LIBRARIES.md §2.8).
 *
 * Every library row already carries `created_by`, `updated_by`, and
 * `approved_by`. Resolving those to names here means versions, approvals, and
 * comment attribution are wired from the start rather than retrofitted once the
 * approval flow lands.
 *
 * Cached per request: a library page can reference the same handful of people
 * across a hundred rows and should not make a hundred calls.
 */
import { cache } from "react";
import { clerkClient } from "@clerk/nextjs/server";

export type UserSummary = {
  id: string;
  name: string;
  initials: string;
  imageUrl?: string;
};

/** Sentinel written by the backfill script for pre-existing assets. */
const SYSTEM_IDS = new Set(["backfill", "system"]);

function initialsFor(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function fallback(id: string): UserSummary {
  if (SYSTEM_IDS.has(id)) return { id, name: "Imported", initials: "—" };
  // A raw Clerk id is meaningless to a reader; say what we actually know.
  return { id, name: "Unknown user", initials: "?" };
}

export const getUserSummaries = cache(async (ids: string[]): Promise<Map<string, UserSummary>> => {
  const map = new Map<string, UserSummary>();
  const unique = [...new Set(ids.filter(Boolean))];
  const lookup = unique.filter((id) => !SYSTEM_IDS.has(id));

  for (const id of unique) map.set(id, fallback(id));
  if (!lookup.length) return map;

  try {
    const client = await clerkClient();
    const { data } = await client.users.getUserList({ userId: lookup, limit: 100 });
    for (const user of data) {
      const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
        || user.username
        || user.primaryEmailAddress?.emailAddress
        || "Unknown user";
      map.set(user.id, {
        id: user.id, name, initials: initialsFor(name),
        imageUrl: user.hasImage ? user.imageUrl : undefined,
      });
    }
  } catch (error) {
    // Attribution is context, not content — never take a page down for it.
    console.error("Failed to resolve Clerk user names", error);
  }

  return map;
});

/** Convenience for a single id. */
export async function getUserSummary(id: string | null | undefined): Promise<UserSummary | null> {
  if (!id) return null;
  const map = await getUserSummaries([id]);
  return map.get(id) ?? fallback(id);
}
