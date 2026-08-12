"use client";

/**
 * The block library — first consumer of the shared shell (LIBRARIES.md §4.2).
 *
 * The load-bearing detail here is status. Draft and approved are rendered with
 * unmistakably different treatment, not a subtle pill, because the failure this
 * prevents is a salesperson unknowingly shipping unapproved copy to a client.
 */
import { useState, useTransition } from "react";
import LibraryShell from "./LibraryShell";
import type { BulkAction, FilterDef, SortDef, Selection } from "./types";
import type { LibraryBlockItem } from "@/lib/data/library";
import type { Tag } from "@/lib/data/taxonomy";
import type { Node, RichText } from "@/lib/slides/types";
import { isLayout } from "@/lib/slides/types";
import {
  deleteLibraryItemsAction, renameLibraryItemAction, setLibraryStatusAction,
  tagLibraryItemsAction, toggleFavoriteAction,
} from "@/app/library/actions";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago",
});

const STATUS_LABELS = { draft: "Draft", in_review: "In review", approved: "Approved" } as const;

function text(value: RichText): string {
  return value.map((part) => part.text).join("");
}

/** A readable one-line gist of any block, used for search and the preview. */
export function nodeSummary(node: Node): string {
  if (isLayout(node)) return `${node.type} · ${node.children.length} ${node.children.length === 1 ? "block" : "blocks"}`;
  switch (node.type) {
    case "title": case "tagline": case "blockquote":
    case "callout": case "paragraph": return text(node.props.text) || node.type;
    case "statCard": return `${node.props.value} · ${node.props.label}`;
    case "image": return node.props.alt || "Image block";
    case "list": return node.props.items.map(text).join(" · ");
    case "process": return node.props.steps.map((step) => step.title).join(" → ");
    case "table": return node.props.header.join(" · ");
    case "pricingTable": return node.props.columns.map((column) => column.name).join(" · ");
    case "chart": return `${node.props.chartType} chart · ${node.props.labels.join(", ")}`;
  }
}

function typeLabel(node: Node): string {
  return node.type.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

export default function BlockLibrary({
  items, categories, tagOptions,
}: {
  items: LibraryBlockItem[];
  categories: Array<{ id: string; name: string; count: number }>;
  tagOptions: Array<{ id: string; name: string; count: number }>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [notice, setNotice] = useState("");
  const [, startTransition] = useTransition();

  /* ------------------------------ Filters ----------------------------- */

  const filters: FilterDef<LibraryBlockItem>[] = [
    {
      id: "status", label: "Status", multiple: true,
      options: (["approved", "in_review", "draft"] as const).map((status) => ({
        value: status,
        label: STATUS_LABELS[status],
        count: items.filter((item) => item.status === status).length,
      })),
      matches: (item, value) => item.status === value,
    },
    {
      id: "category", label: "Category", multiple: true,
      options: categories.map((c) => ({ value: c.id, label: c.name, count: c.count })),
      matches: (item, value) => item.category?.id === value,
    },
    {
      id: "tag", label: "Tags", multiple: true,
      options: tagOptions.map((t) => ({ value: t.id, label: t.name, count: t.count })),
      matches: (item, value) => item.tags.some((tag) => tag.id === value),
    },
    {
      id: "type", label: "Block type", multiple: true,
      options: [...new Set(items.map((item) => item.node.type))].sort().map((type) => ({
        value: type,
        label: type.replace(/([A-Z])/g, " $1").replace(/^./, (l) => l.toUpperCase()),
        count: items.filter((item) => item.node.type === type).length,
      })),
      matches: (item, value) => item.node.type === value,
    },
    {
      id: "flag", label: "Show", multiple: true,
      options: [
        { value: "favorites", label: "Favorites only", count: items.filter((i) => i.favorited).length },
        { value: "untagged", label: "Needs tagging", hint: "No category or tags", count: items.filter((i) => !i.category && !i.tags.length).length },
        { value: "unused", label: "Not used in any deck", count: items.filter((i) => i.usageCount === 0).length },
      ],
      matches: (item, value) => {
        if (value === "favorites") return item.favorited;
        if (value === "untagged") return !item.category && item.tags.length === 0;
        return item.usageCount === 0;
      },
    },
  ];

  const sorts: SortDef<LibraryBlockItem>[] = [
    { id: "updated", label: "Recently updated", compare: (a, b) => b.updatedAt.localeCompare(a.updatedAt) },
    { id: "created", label: "Recently added", compare: (a, b) => b.createdAt.localeCompare(a.createdAt) },
    { id: "name", label: "Name (A–Z)", compare: (a, b) => a.name.localeCompare(b.name) },
    { id: "used", label: "Most used", compare: (a, b) => b.usageCount - a.usageCount },
  ];

  /* ---------------------------- Bulk actions --------------------------- */

  async function announce(run: () => Promise<{ status: string; message?: string }>): Promise<string> {
    const result = await run();
    if (result.status === "error") throw new Error(result.message);
    return result.message ?? "Done.";
  }

  const bulkActions: BulkAction<LibraryBlockItem>[] = [
    {
      id: "approve", label: "Approve",
      disabledReason: (selected) =>
        selected.every((item) => item.status === "approved") ? "Everything selected is already approved." : null,
      confirm: (selected) => `Approve ${selected.length} ${selected.length === 1 ? "block" : "blocks"}? Approved copy is what sales sees by default.`,
      run: (selected) => announce(() => setLibraryStatusAction({ ids: selected.map((i) => i.id), status: "approved" })),
    },
    {
      id: "draft", label: "Return to draft",
      disabledReason: (selected) =>
        selected.every((item) => item.status === "draft") ? "Everything selected is already a draft." : null,
      run: (selected) => announce(() => setLibraryStatusAction({ ids: selected.map((i) => i.id), status: "draft" })),
    },
    {
      id: "categorize", label: "Categorize…",
      run: (selected) => {
        const name = window.prompt(`Category for ${selected.length} ${selected.length === 1 ? "block" : "blocks"}:`);
        if (!name?.trim()) return "No category applied.";
        return announce(() => tagLibraryItemsAction({ ids: selected.map((i) => i.id), tagName: name, kind: "category" }));
      },
    },
    {
      id: "tag", label: "Tag…",
      run: (selected) => {
        const name = window.prompt(`Tag for ${selected.length} ${selected.length === 1 ? "block" : "blocks"}:`);
        if (!name?.trim()) return "No tag applied.";
        return announce(() => tagLibraryItemsAction({ ids: selected.map((i) => i.id), tagName: name, kind: "tag" }));
      },
    },
    {
      id: "delete", label: "Delete", destructive: true,
      disabledReason: (selected) => {
        const locked = selected.filter((item) => item.locked);
        return locked.length ? `${locked.length} of these are locked. Unlock them first.` : null;
      },
      confirm: (selected) => {
        const used = selected.filter((item) => item.usageCount > 0);
        const names = selected.length <= 4 ? `: ${selected.map((i) => i.name).join(", ")}` : "";
        const warning = used.length
          ? `\n\n${used.length} of these are used in decks. Those slides keep their copy, but the blocks detach from the library.`
          : "";
        return `Delete ${selected.length} ${selected.length === 1 ? "block" : "blocks"}${names}?${warning}`;
      },
      run: (selected) => announce(() => deleteLibraryItemsAction(selected.map((i) => i.id))),
    },
  ];

  /* ------------------------------ Actions ------------------------------ */

  function rename(item: LibraryBlockItem) {
    const name = draftName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await renameLibraryItemAction({ id: item.id, name });
      setNotice(result.status === "error" ? result.message : `Renamed to “${name}”.`);
      if (result.status === "complete") setEditingId(null);
    });
  }

  function favorite(item: LibraryBlockItem) {
    startTransition(async () => {
      const result = await toggleFavoriteAction(item.id);
      setNotice(result.status === "error" ? result.message : result.message ?? "");
    });
  }

  /* ------------------------------ Views -------------------------------- */

  function renderCard(item: LibraryBlockItem, index: number, selection: Selection) {
    const checkboxId = `select-${item.id}`;
    return (
      <article
        key={item.id}
        className="lib-block-card"
        data-status={item.status}
        data-selected={selection.isSelected(item.id) || undefined}
      >
        <div className="lib-block-select">
          <input
            id={checkboxId} type="checkbox"
            checked={selection.isSelected(item.id)}
            onChange={(event) => selection.toggle(
              item.id, index,
              (event.nativeEvent as MouseEvent).shiftKey,
            )}
          />
          <label htmlFor={checkboxId} className="sr-only">Select {item.name}</label>
        </div>

        <button
          type="button"
          className={`lib-block-star${item.favorited ? " is-on" : ""}`}
          aria-pressed={item.favorited}
          onClick={() => favorite(item)}
        >
          <span aria-hidden="true">{item.favorited ? "★" : "☆"}</span>
          <span className="sr-only">{item.favorited ? "Remove" : "Add"} {item.name} {item.favorited ? "from" : "to"} favorites</span>
        </button>

        <div className="lib-block-preview">
          <span className="lib-block-type">{typeLabel(item.node)}</span>
          <p>{nodeSummary(item.node)}</p>
        </div>

        <div className="lib-block-body">
          {editingId === item.id ? (
            <form onSubmit={(event) => { event.preventDefault(); rename(item); }}>
              <label>
                <span className="sr-only">Block name</span>
                <input autoFocus maxLength={100} value={draftName}
                  onChange={(event) => setDraftName(event.target.value)} />
              </label>
              <div>
                <button type="button" className="button button-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                <button type="submit" className="button button-primary" disabled={!draftName.trim()}>Save</button>
              </div>
            </form>
          ) : (
            <>
              <div className="lib-block-heading">
                <h2>{item.name}</h2>
                <StatusPill status={item.status} />
              </div>

              <TagRow category={item.category} tags={item.tags} />

              <p className="lib-block-meta">
                <span>v{item.version}</span>
                <span aria-hidden="true">·</span>
                <span>{item.usageCount > 0 ? `Used in ${item.usageCount} ${item.usageCount === 1 ? "deck" : "decks"}` : "Not used yet"}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={item.updatedAt}>{dateFormatter.format(new Date(item.updatedAt))}</time>
              </p>

              <div className="lib-block-actions">
                <button type="button" onClick={() => { setEditingId(item.id); setDraftName(item.name); }}>Rename</button>
                <button type="button" className="is-danger" onClick={async () => {
                  const warning = item.usageCount > 0
                    ? `\n\nUsed in ${item.usageCount} ${item.usageCount === 1 ? "deck" : "decks"}. Those slides keep their copy but detach from the library.`
                    : "";
                  if (!window.confirm(`Delete “${item.name}”?${warning}`)) return;
                  const result = await deleteLibraryItemsAction([item.id]);
                  setNotice(result.status === "error" ? result.message : result.message ?? "");
                }}>Delete</button>
              </div>
            </>
          )}
        </div>
      </article>
    );
  }

  function renderRow(item: LibraryBlockItem, index: number, selection: Selection) {
    const checkboxId = `select-row-${item.id}`;
    return (
      <tr key={item.id} data-status={item.status} data-selected={selection.isSelected(item.id) || undefined}>
        <td>
          <input
            id={checkboxId} type="checkbox"
            checked={selection.isSelected(item.id)}
            onChange={(event) => selection.toggle(item.id, index, (event.nativeEvent as MouseEvent).shiftKey)}
          />
          <label htmlFor={checkboxId} className="sr-only">Select {item.name}</label>
        </td>
        <th scope="row">
          <strong>{item.name}</strong>
          <span>{nodeSummary(item.node)}</span>
        </th>
        <td><StatusPill status={item.status} /></td>
        <td>{item.category?.name ?? <span className="lib-muted">Uncategorized</span>}</td>
        <td>{typeLabel(item.node)}</td>
        <td className="lib-numeric">{item.usageCount || <span className="lib-muted">—</span>}</td>
        <td><time dateTime={item.updatedAt}>{dateFormatter.format(new Date(item.updatedAt))}</time></td>
      </tr>
    );
  }

  return (
    <>
      {notice && <p className="library-status" role="status">{notice}</p>}
      <LibraryShell<LibraryBlockItem>
        title="Content blocks"
        description="Reusable groups of content. Approved blocks are what sales sees by default; drafts stay visibly provisional until someone signs off."
        items={items}
        storageKey="blocks"
        searchText={(item) => [
          item.name, item.description ?? "", item.node.type, nodeSummary(item.node),
          item.category?.name ?? "", item.tags.map((t) => t.name).join(" "),
        ].join(" ")}
        views={["grid", "list"]}
        filters={filters}
        sorts={sorts}
        bulkActions={bulkActions}
        addActions={[
          { id: "from-deck", label: "Save from a deck", hint: "Use the ★ on any block while editing", href: "/decks" },
        ]}
        emptyState={{
          heading: "Build the library from a deck",
          body: "Open a deck and use the star button on any block to save a reusable snapshot. It will show up here with its category, tags, and approval state.",
        }}
        noResultsState={{
          heading: "No blocks match those filters",
          body: "Try a different search or clear the filters. If you are hunting for something unapproved, check that Draft is included in the status filter.",
        }}
        renderView={(mode, visible, selection) =>
          mode === "grid" ? (
            <div className="lib-block-grid">
              {visible.map((item, index) => renderCard(item, index, selection))}
            </div>
          ) : (
            <table className="lib-table">
              <caption className="sr-only">Content blocks, {visible.length} shown</caption>
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Select</span></th>
                  <th scope="col">Name</th>
                  <th scope="col">Status</th>
                  <th scope="col">Category</th>
                  <th scope="col">Type</th>
                  <th scope="col">Decks</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>{visible.map((item, index) => renderRow(item, index, selection))}</tbody>
            </table>
          )
        }
      />
    </>
  );
}

/** Status is never colour-only: each state carries its own text and glyph so it
 *  survives greyscale, colour blindness, and a screen reader. */
function StatusPill({ status }: { status: "draft" | "in_review" | "approved" }) {
  const glyph = status === "approved" ? "✓" : status === "in_review" ? "◐" : "◌";
  return (
    <span className="lib-status-pill" data-status={status}>
      <span aria-hidden="true">{glyph}</span>{STATUS_LABELS[status]}
    </span>
  );
}

function TagRow({ category, tags }: { category: Tag | null; tags: Tag[] }) {
  if (!category && !tags.length) {
    return <p className="lib-block-tags"><span className="lib-tag is-missing">Needs tagging</span></p>;
  }
  return (
    <p className="lib-block-tags">
      {category && <span className="lib-tag is-category">{category.name}</span>}
      {tags.map((tag) => <span key={tag.id} className="lib-tag">{tag.name}</span>)}
    </p>
  );
}
