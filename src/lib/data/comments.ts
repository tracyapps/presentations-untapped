/**
 * Threaded comments on any subject (LIBRARIES.md §2.7).
 *
 * The marketing conversation about a block's wording belongs with the block, not
 * with one deck that happens to use it — which is why `comments` carries a
 * `subject_type`/`subject_id` pair rather than a required deck.
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { comments } from "@/lib/db/schema";
import { getUserSummaries, type UserSummary } from "./users";

export type CommentSubject = "deck" | "slide" | "block" | "library_item";

export type CommentNode = {
  id: string;
  body: string;
  author: UserSummary | null;
  createdAt: string;
  resolvedAt: string | null;
  replies: CommentNode[];
};

export async function getComments(
  subjectType: CommentSubject,
  subjectId: string,
): Promise<CommentNode[]> {
  const rows = await db.select({
    id: comments.id, body: comments.body, authorId: comments.authorId,
    parentId: comments.parentId, createdAt: comments.createdAt, resolvedAt: comments.resolvedAt,
  })
    .from(comments)
    .where(and(eq(comments.subjectType, subjectType), eq(comments.subjectId, subjectId)))
    .orderBy(asc(comments.createdAt));

  const people = await getUserSummaries(rows.map((row) => row.authorId));

  const byId = new Map<string, CommentNode>();
  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      body: row.body,
      author: people.get(row.authorId) ?? null,
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      replies: [],
    });
  }

  const roots: CommentNode[] = [];
  for (const row of rows) {
    const node = byId.get(row.id);
    if (!node) continue;
    const parent = row.parentId ? byId.get(row.parentId) : null;
    // A reply whose parent was deleted becomes a root rather than vanishing —
    // losing someone's words to a tidy-up is worse than a slightly odd thread.
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }

  return roots;
}

export async function countUnresolvedComments(
  subjectType: CommentSubject,
  subjectId: string,
): Promise<number> {
  const rows = await db.select({ id: comments.id })
    .from(comments)
    .where(and(
      eq(comments.subjectType, subjectType),
      eq(comments.subjectId, subjectId),
    ));
  return rows.length;
}
