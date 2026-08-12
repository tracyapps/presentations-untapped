"use client";

/**
 * The single-item edit screen (LIBRARIES.md §4.2).
 *
 * A route rather than an inline editor, deliberately: it is linkable ("Jim, can
 * you approve this: <url>"), which is exactly what the approval workflow needs.
 *
 * Full-bleed and three columns on a wide screen — details left, discussion
 * centre and widest because it is the part that grows, approval and history
 * right. The preview is its own band across the top: block previews are
 * variable-height by design and a column would either crop them or leave the
 * other columns short.
 *
 * Delete sits at the end of the right rail in its own bordered region, not on
 * the grid card. Moving it here is most of what stops accidental deletion.
 *
 * There is deliberately **no "duplicate this block"**. Duplicating forks a new
 * parent and orphans the discussion, approval, and history that make a library
 * item trustworthy. Versions are the intended path, which is why the pop-out
 * editor puts "Save as new version" next to "Save changes".
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BlockPreview from "./BlockPreview";
import BlockEditModal from "./BlockEditModal";
import type { LibraryBlockItem } from "@/lib/data/library";
import type { CommentNode } from "@/lib/data/comments";
import type { Node } from "@/lib/slides/types";
import {
  addCommentAction, deleteLibraryItemsAction, saveLibraryItemPayloadAction,
  setLibraryItemTagsAction, setLibraryStatusAction, updateLibraryItemAction,
} from "@/app/library/actions";

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric",
  hour: "numeric", minute: "2-digit", timeZone: "America/Chicago",
});

const STATUS_LABELS = { draft: "Draft", in_review: "In review", approved: "Approved" } as const;

export default function BlockDetail({
  item, comments, categorySuggestions, tagSuggestions,
}: {
  item: LibraryBlockItem;
  comments: CommentNode[];
  categorySuggestions: string[];
  tagSuggestions: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);

  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  const [category, setCategory] = useState(item.category?.name ?? "");
  const [tagText, setTagText] = useState(item.tags.map((tag) => tag.name).join(", "));
  const [commentBody, setCommentBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");

  const detailsDirty = name !== item.name || description !== (item.description ?? "");
  const tagsDirty = category !== (item.category?.name ?? "")
    || tagText !== item.tags.map((tag) => tag.name).join(", ");

  function run(action: () => Promise<{ status: string; message?: string }>, fallback: string) {
    startTransition(async () => {
      const result = await action();
      setNotice(result.message ?? (result.status === "error" ? "Something went wrong." : fallback));
      if (result.status === "complete") router.refresh();
    });
  }

  async function savePayload(node: Node) {
    const result = await saveLibraryItemPayloadAction({ id: item.id, node });
    if (result.status === "complete") {
      setNotice(result.message ?? "Saved.");
      setEditorOpen(false);
      router.refresh();
    }
    return result;
  }

  return (
    <div className="lib-detail">
      <nav className="lib-breadcrumbs" aria-label="Breadcrumb">
        <ol>
          <li><Link href="/decks">Decks</Link></li>
          <li><Link href="/library">Content blocks</Link></li>
          <li aria-current="page">{item.name}</li>
        </ol>
      </nav>

      <header className="lib-detail-header">
        <div>
          <h1>{item.name}</h1>
          <p className="lib-detail-sub">
            <span className="lib-status-pill" data-status={item.status}>
              <span aria-hidden="true">{item.status === "approved" ? "✓" : item.status === "in_review" ? "◐" : "◌"}</span>
              {STATUS_LABELS[item.status]}
            </span>
            <span>Version {item.version}</span>
            <span aria-hidden="true">·</span>
            <span>{item.usageCount > 0
              ? `Used in ${item.usageCount} ${item.usageCount === 1 ? "deck" : "decks"}`
              : "Not used in any deck yet"}</span>
          </p>
        </div>
        <Link className="button button-secondary" href="/library">Back to library</Link>
      </header>

      {notice && <p className="library-status" role="status">{notice}</p>}

      {/* Preview band. Full width because block heights vary wildly and the
          whole block should always be visible (LIBRARIES.md §11). */}
      <section className="lib-panel lib-preview-band" aria-labelledby="preview-heading">
        <div className="lib-panel-head">
          <h2 id="preview-heading">Preview</h2>
          <button type="button" className="button button-secondary" onClick={() => setEditorOpen(true)}>
            Edit block
          </button>
        </div>

        {/* Double-click opens the source, the way a smart object does. The
            button above is the discoverable path; this is the fast one. */}
        <div
          className="lib-detail-preview"
          onDoubleClick={() => setEditorOpen(true)}
          title="Double-click to edit this block"
        >
          <BlockPreview node={item.node} />
        </div>

        <p className="lib-panel-note">
          Blocks preview as themselves, without slide styling — that is how a
          block differs from a whole slide in the slide library. Double-click the
          preview to edit the source.
        </p>
      </section>

      <div className="lib-detail-grid">
        <div className="lib-detail-col">
          <section className="lib-panel" aria-labelledby="details-heading">
            <div className="lib-panel-head"><h2 id="details-heading">Details</h2></div>
            <form
              className="lib-form"
              onSubmit={(event) => {
                event.preventDefault();
                run(() => updateLibraryItemAction({ id: item.id, name, description }), "Saved.");
              }}
            >
              <label className="field">
                <span>Name</span>
                <input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} required />
              </label>
              <label className="field">
                <span>Description <em>Optional — what this is for, and when to use it</em></span>
                <textarea value={description} maxLength={500} rows={3}
                  onChange={(event) => setDescription(event.target.value)} />
              </label>
              <div className="lib-form-actions">
                <button type="submit" className="button button-primary"
                  aria-disabled={!detailsDirty || isPending} data-disabled={!detailsDirty || isPending || undefined}>
                  Save details
                </button>
                {detailsDirty && <span className="lib-dirty">Unsaved changes</span>}
              </div>
            </form>
          </section>

          <section className="lib-panel" aria-labelledby="tags-heading">
            <div className="lib-panel-head"><h2 id="tags-heading">Category and tags</h2></div>
            <form
              className="lib-form"
              onSubmit={(event) => {
                event.preventDefault();
                run(() => setLibraryItemTagsAction({
                  id: item.id, categoryName: category,
                  tagNames: tagText.split(",").map((value) => value.trim()).filter(Boolean),
                }), "Tags updated.");
              }}
            >
              <label className="field">
                <span>Category <em>One per block — the &ldquo;what kind of thing is this&rdquo; axis</em></span>
                <input value={category} list="category-suggestions" maxLength={60}
                  placeholder="Intro, Case study, Pricing…"
                  onChange={(event) => setCategory(event.target.value)} />
                <datalist id="category-suggestions">
                  {categorySuggestions.map((entry) => <option key={entry} value={entry} />)}
                </datalist>
              </label>
              <label className="field">
                <span>Tags <em>Comma separated. Industry, tone, campaign — whatever helps you find it</em></span>
                <input value={tagText} list="tag-suggestions" maxLength={400}
                  placeholder="hospitality, loyalty, q4"
                  onChange={(event) => setTagText(event.target.value)} />
                <datalist id="tag-suggestions">
                  {tagSuggestions.map((entry) => <option key={entry} value={entry} />)}
                </datalist>
              </label>
              <div className="lib-form-actions">
                <button type="submit" className="button button-primary"
                  aria-disabled={!tagsDirty || isPending} data-disabled={!tagsDirty || isPending || undefined}>
                  Save tags
                </button>
                {tagsDirty && <span className="lib-dirty">Unsaved changes</span>}
              </div>
            </form>
          </section>
        </div>

        {/* Centre and widest: the discussion is the part that grows. */}
        <div className="lib-detail-col is-wide">
          <section className="lib-panel" aria-labelledby="discussion-heading">
            <div className="lib-panel-head">
              <h2 id="discussion-heading">Discussion</h2>
              <p className="lib-panel-note">Comments live with the block, not with any one deck.</p>
            </div>

            <form
              className="lib-comment-form"
              onSubmit={(event) => {
                event.preventDefault();
                run(async () => {
                  const result = await addCommentAction({ subjectId: item.id, body: commentBody });
                  if (result.status === "complete") setCommentBody("");
                  return result;
                }, "Comment posted.");
              }}
            >
              <label>
                <span className="sr-only">Add a comment</span>
                <textarea rows={3} value={commentBody} maxLength={4000}
                  placeholder="Ask a question, suggest a change, or note why this wording was chosen…"
                  onChange={(event) => setCommentBody(event.target.value)} />
              </label>
              <button type="submit" className="button button-primary"
                aria-disabled={!commentBody.trim() || isPending}
                data-disabled={!commentBody.trim() || isPending || undefined}>
                Comment
              </button>
            </form>

            {comments.length === 0 ? (
              <p className="lib-panel-note">No comments yet.</p>
            ) : (
              <ol className="lib-comments">
                {comments.map((comment) => (
                  <li key={comment.id}>
                    <CommentBody comment={comment} />
                    {comment.replies.length > 0 && (
                      <ol className="lib-comments is-replies">
                        {comment.replies.map((reply) => (
                          <li key={reply.id}><CommentBody comment={reply} /></li>
                        ))}
                      </ol>
                    )}
                    {replyTo === comment.id ? (
                      <form
                        className="lib-comment-form is-reply"
                        onSubmit={(event) => {
                          event.preventDefault();
                          run(async () => {
                            const result = await addCommentAction({
                              subjectId: item.id, body: replyBody, parentId: comment.id,
                            });
                            if (result.status === "complete") { setReplyBody(""); setReplyTo(null); }
                            return result;
                          }, "Reply posted.");
                        }}
                      >
                        <label>
                          <span className="sr-only">Reply to {comment.author?.name ?? "this comment"}</span>
                          <textarea autoFocus rows={2} value={replyBody} maxLength={4000}
                            onChange={(event) => setReplyBody(event.target.value)} />
                        </label>
                        <div>
                          <button type="button" className="button button-secondary"
                            onClick={() => { setReplyTo(null); setReplyBody(""); }}>Cancel</button>
                          <button type="submit" className="button button-primary"
                            aria-disabled={!replyBody.trim()} data-disabled={!replyBody.trim() || undefined}>Reply</button>
                        </div>
                      </form>
                    ) : (
                      <button type="button" className="lib-comment-reply" onClick={() => setReplyTo(comment.id)}>
                        Reply<span className="sr-only"> to {comment.author?.name ?? "this comment"}</span>
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="lib-detail-col">
          <section className="lib-panel" aria-labelledby="approval-heading">
            <div className="lib-panel-head"><h2 id="approval-heading">Approval</h2></div>
            <div className="lib-approval">
              {(["draft", "in_review", "approved"] as const).map((status) => (
                <button
                  key={status} type="button"
                  className={`lib-approval-step${item.status === status ? " is-current" : ""}`}
                  aria-pressed={item.status === status}
                  aria-disabled={isPending} data-disabled={isPending || undefined}
                  onClick={() => run(
                    () => setLibraryStatusAction({ ids: [item.id], status }),
                    `Marked ${STATUS_LABELS[status].toLowerCase()}.`,
                  )}
                >
                  {STATUS_LABELS[status]}
                </button>
              ))}
            </div>
            {item.approver && item.approvedAt && (
              <p className="lib-panel-note">
                Approved by {item.approver.name} on{" "}
                <time dateTime={item.approvedAt}>{dateTimeFormatter.format(new Date(item.approvedAt))}</time>
              </p>
            )}
          </section>

          <section className="lib-panel" aria-labelledby="history-heading">
            <div className="lib-panel-head"><h2 id="history-heading">History</h2></div>
            <dl className="lib-meta-list">
              <dt>Created</dt>
              <dd>
                {item.author?.name ?? "Unknown"}<br />
                <time dateTime={item.createdAt}>{dateTimeFormatter.format(new Date(item.createdAt))}</time>
              </dd>
              <dt>Last edited</dt>
              <dd>
                {item.editor?.name ?? item.author?.name ?? "Unknown"}<br />
                <time dateTime={item.updatedAt}>{dateTimeFormatter.format(new Date(item.updatedAt))}</time>
              </dd>
              <dt>Version</dt>
              <dd>{item.version}</dd>
            </dl>
          </section>

          <section className="lib-panel is-danger-zone" aria-labelledby="danger-heading">
            <div className="lib-panel-head"><h2 id="danger-heading">Delete this block</h2></div>
            <p className="lib-panel-note">
              {item.usageCount > 0
                ? `Used in ${item.usageCount} ${item.usageCount === 1 ? "deck" : "decks"}. Those slides keep their copy but detach from the library.`
                : "Not used in any deck. Nothing else will change."}
            </p>
            <button
              type="button" className="button button-danger"
              aria-disabled={item.locked || isPending} data-disabled={item.locked || isPending || undefined}
              title={item.locked ? "This block is locked. Unlock it first." : undefined}
              onClick={() => {
                if (item.locked) { setNotice("This block is locked. Unlock it first."); return; }
                if (!window.confirm(`Delete “${item.name}”? This cannot be undone.`)) return;
                startTransition(async () => {
                  const result = await deleteLibraryItemsAction([item.id]);
                  if (result.status === "error") { setNotice(result.message); return; }
                  router.push("/library");
                });
              }}
            >
              Delete block
            </button>
          </section>
        </div>
      </div>

      {editorOpen && (
        <BlockEditModal
          name={item.name}
          version={item.version}
          node={item.node}
          usageCount={item.usageCount}
          onCancel={() => setEditorOpen(false)}
          onSave={savePayload}
        />
      )}
    </div>
  );
}

function CommentBody({ comment }: { comment: CommentNode }) {
  return (
    <article className="lib-comment">
      <header>
        <span className="lib-avatar" aria-hidden="true">{comment.author?.initials ?? "?"}</span>
        <strong>{comment.author?.name ?? "Unknown user"}</strong>
        <time dateTime={comment.createdAt}>{dateTimeFormatter.format(new Date(comment.createdAt))}</time>
      </header>
      <p>{comment.body}</p>
    </article>
  );
}
