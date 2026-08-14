"use client";

/**
 * The block library — first consumer of the shared shell (LIBRARIES.md §4.2).
 *
 * Cards are now navigation, not workbenches: name, preview, status, tags, and a
 * favorite toggle. Rename, delete, tagging, approval, and discussion all live on
 * the item's own screen, which keeps destructive actions away from a grid you
 * are scanning quickly.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import LibraryShell from "./LibraryShell";
import DataTable from "./DataTable";
import BlockPreview from "./BlockPreview";
import StatusPill from "./StatusPill";
import {
  blockDraftToggle, blockFilters, blockSearchText, blockSorts, nodeSummary,
  type TaxonomyOption,
} from "./block-catalog";
import type { BulkAction, ColumnDef, Selection } from "./types";
import type { LibraryBlockItem } from "@/lib/data/library";
import type { Tag } from "@/lib/data/taxonomy";
import {
  deleteLibraryItemsAction, setLibraryStatusAction,
  tagLibraryItemsAction, toggleFavoriteAction,
} from "@/app/library/actions";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago",
});

export default function BlockLibrary({
  items, categories, tagOptions,
}: {
  items: LibraryBlockItem[];
  categories: TaxonomyOption[];
  tagOptions: TaxonomyOption[];
}) {
  const [notice, setNotice] = useState("");
  const [, startTransition] = useTransition();

  const filters = blockFilters(items, categories, tagOptions);
  const sorts = blockSorts;

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

  function favorite(item: LibraryBlockItem) {
    startTransition(async () => {
      const result = await toggleFavoriteAction(item.id);
      setNotice(result.status === "error" ? result.message : result.message ?? "");
    });
  }

  /* ------------------------------- Views ------------------------------- */

  function renderCard(item: LibraryBlockItem, index: number, selection: Selection) {
    const checkboxId = `select-${item.id}`;
    return (
      <article
        key={item.id} className="lib-block-card" data-status={item.status}
        data-selected={selection.isSelected(item.id) || undefined}
      >
        <div className="lib-block-select">
          <input
            id={checkboxId} type="checkbox" checked={selection.isSelected(item.id)}
            onChange={(event) => selection.toggle(item.id, index, (event.nativeEvent as MouseEvent).shiftKey)}
          />
          <label htmlFor={checkboxId} className="sr-only">Select {item.name}</label>
        </div>

        {/* Star = my favorite. The bookmark in the editor means "save to
            library" — one glyph cannot mean two things. */}
        <button
          type="button" className={`lib-block-star${item.favorited ? " is-on" : ""}`}
          aria-pressed={item.favorited} onClick={() => favorite(item)}
        >
          <span aria-hidden="true">{item.favorited ? "★" : "☆"}</span>
          <span className="sr-only">
            {item.favorited ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`}
          </span>
        </button>

        <div className="lib-block-preview">
          <BlockPreview node={item.node} />
        </div>

        <div className="lib-block-body">
          <div className="lib-block-heading">
            <h2><Link href={`/library/blocks/${item.id}`}>{item.name}</Link></h2>
            <StatusPill status={item.status} />
          </div>

          <TagRow category={item.category} tags={item.tags} />

          <p className="lib-block-meta">
            <span>v{item.version}</span>
            <span aria-hidden="true">·</span>
            <span>{item.usageCount > 0
              ? `${item.usageCount} ${item.usageCount === 1 ? "deck" : "decks"}`
              : "Unused"}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={item.updatedAt}>{dateFormatter.format(new Date(item.updatedAt))}</time>
          </p>
        </div>
      </article>
    );
  }

  const columns: ColumnDef<LibraryBlockItem>[] = [
    {
      id: "name", label: "Name", required: true, isRowHeader: true, width: 320, minWidth: 180,
      compare: (a, b) => a.name.localeCompare(b.name),
      render: (item) => (
        <>
          <Link className="lib-table-name" href={`/library/blocks/${item.id}`}>{item.name}</Link>
          <span className="lib-table-gist">{nodeSummary(item.node)}</span>
        </>
      ),
    },
    {
      id: "status", label: "Status", width: 130,
      compare: (a, b) => a.status.localeCompare(b.status),
      render: (item) => <StatusPill status={item.status} />,
    },
    {
      id: "category", label: "Category", width: 150,
      compare: (a, b) => (a.category?.name ?? "").localeCompare(b.category?.name ?? ""),
      render: (item) => item.category?.name ?? <span className="lib-muted">Uncategorized</span>,
    },
    {
      id: "tags", label: "Tags", width: 200, defaultHidden: true,
      render: (item) => item.tags.length
        ? item.tags.map((tag) => tag.name).join(", ")
        : <span className="lib-muted">—</span>,
    },
    {
      id: "usage", label: "Decks", width: 90, align: "end",
      compare: (a, b) => a.usageCount - b.usageCount,
      render: (item) => item.usageCount || <span className="lib-muted">—</span>,
    },
    {
      id: "version", label: "Version", width: 90, align: "end", defaultHidden: true,
      compare: (a, b) => a.version - b.version,
      render: (item) => item.version,
    },
    {
      id: "author", label: "Created by", width: 160, defaultHidden: true,
      compare: (a, b) => (a.author?.name ?? "").localeCompare(b.author?.name ?? ""),
      render: (item) => item.author?.name ?? <span className="lib-muted">Unknown</span>,
    },
    {
      id: "updated", label: "Updated", width: 140,
      compare: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
      render: (item) => <time dateTime={item.updatedAt}>{dateFormatter.format(new Date(item.updatedAt))}</time>,
    },
  ];

  return (
      <LibraryShell<LibraryBlockItem>
        breadcrumbs={[{ label: "Decks", href: "/decks" }, { label: "Content blocks" }]}
        notice={notice}
        title="Content blocks"
        description="Reusable groups of content. Everything shows by default; switch to approved only when you are building something a client will see."
        items={items}
        storageKey="blocks"
        searchText={blockSearchText}
        views={["grid", "list"]}
        filters={filters}
        draftToggle={blockDraftToggle(items)}
        sorts={sorts}
        sortHiddenForViews={["list"]}
        bulkActions={bulkActions}
        addActions={[
          { id: "from-deck", label: "Save from a deck", hint: "Use the bookmark on any block while editing", href: "/decks" },
          { id: "new-here", label: "Create a block here", hint: "Coming in v2 — compose without opening a deck", comingSoon: true },
        ]}
        emptyState={{
          heading: "Build the library from a deck",
          body: "Open a deck and use the bookmark button on any block to save a reusable snapshot. It will show up here with its category, tags, and approval state.",
        }}
        noResultsState={{
          heading: "No blocks match those filters",
          body: "Try a different search or clear the filters. If “Approved only” is on, switching it off will show drafts too.",
        }}
        renderView={(mode, visible, selection) =>
          mode === "grid" ? (
            <div className="lib-block-grid">
              {visible.map((item, index) => renderCard(item, index, selection))}
            </div>
          ) : (
            <DataTable<LibraryBlockItem>
              items={visible}
              columns={columns}
              selection={selection}
              storageKey="blocks"
              rowLabel={(item) => item.name}
              caption={`Content blocks, ${visible.length} shown`}
            />
          )
        }
      />
  );
}

function TagRow({ category, tags }: { category: Tag | null; tags: Tag[] }) {
  if (!category && !tags.length) {
    return <p className="lib-block-tags"><span className="lib-tag is-missing">Needs tagging</span></p>;
  }
  return (
    <p className="lib-block-tags">
      {category && <span className="lib-tag is-category">{category.name}</span>}
      {tags.slice(0, 3).map((tag) => <span key={tag.id} className="lib-tag">{tag.name}</span>)}
      {tags.length > 3 && <span className="lib-tag is-more">+{tags.length - 3}</span>}
    </p>
  );
}
