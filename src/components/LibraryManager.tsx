"use client";

import { useMemo, useState, useTransition } from "react";
import { deleteLibraryItemAction, renameLibraryItemAction } from "@/app/library/actions";
import type { LibraryBlockItem } from "@/lib/data/library";
import type { Node, RichText } from "@/lib/slides/types";
import { isLayout } from "@/lib/slides/types";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/Chicago",
});

function text(value: RichText): string {
  return value.map((part) => part.text).join("");
}

function nodeSummary(node: Node): string {
  if (isLayout(node)) return `${node.type} · ${node.children.length} ${node.children.length === 1 ? "block" : "blocks"}`;
  switch (node.type) {
    case "title":
    case "tagline":
    case "blockquote":
    case "callout":
    case "paragraph": return text(node.props.text) || node.type;
    case "statCard": return `${node.props.value} · ${node.props.label}`;
    case "image": return node.props.alt || "Image block";
    case "list": return node.props.items.map(text).join(" · ");
    case "table": return node.props.header.join(" · ");
    case "pricingTable": return node.props.columns.map((column) => column.name).join(" · ");
    case "chart": return `${node.props.chartType} chart · ${node.props.labels.join(", ")}`;
  }
}

export default function LibraryManager({ initialItems }: { initialItems: LibraryBlockItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter((item) => !normalized || `${item.name} ${item.node.type} ${nodeSummary(item.node)}`.toLowerCase().includes(normalized));
  }, [items, query]);

  function beginRename(item: LibraryBlockItem) {
    setEditingId(item.id);
    setDraftName(item.name);
    setMessage("");
  }

  function rename(item: LibraryBlockItem) {
    const name = draftName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await renameLibraryItemAction({ id: item.id, name });
      if (result.status === "error") {
        setMessage(result.message);
        return;
      }
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, name, updatedAt: new Date().toISOString() } : entry));
      setEditingId(null);
      setMessage(`Renamed the block to “${name}”.`);
    });
  }

  function remove(item: LibraryBlockItem) {
    if (!window.confirm(`Delete “${item.name}” from the library? Existing slide copies will not be affected.`)) return;
    startTransition(async () => {
      const result = await deleteLibraryItemAction(item.id);
      if (result.status === "error") {
        setMessage(result.message);
        return;
      }
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setMessage(`Deleted “${item.name}” from the library.`);
    });
  }

  return (
    <section className="library-manager" aria-label="Saved content blocks">
      <div className="library-toolbar">
        <label className="search-field"><span className="sr-only">Search library</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names, types, or content" /></label>
        <span>{visibleItems.length} {visibleItems.length === 1 ? "block" : "blocks"}</span>
      </div>
      {message && <p className="library-status" role="status">{message}</p>}
      {!items.length ? (
        <div className="empty-state">
          <p className="eyebrow">No saved blocks yet</p>
          <h2>Build the library from a deck</h2>
          <p>Open a deck and use the star button on any block to save a reusable snapshot.</p>
        </div>
      ) : !visibleItems.length ? (
        <div className="empty-state"><h2>No matching blocks</h2><p>Try another name, block type, or phrase.</p></div>
      ) : (
        <div className="library-grid">
          {visibleItems.map((item) => (
            <article className="library-card" key={item.id}>
              <div className="library-card-preview"><span>{item.node.type.replace(/([A-Z])/g, " $1")}</span><p>{nodeSummary(item.node)}</p></div>
              <div className="library-card-body">
                {editingId === item.id ? (
                  <form onSubmit={(event) => { event.preventDefault(); rename(item); }}>
                    <label><span className="sr-only">Library block name</span><input autoFocus maxLength={100} value={draftName} onChange={(event) => setDraftName(event.target.value)} /></label>
                    <div><button className="button button-secondary" type="button" disabled={isPending} onClick={() => setEditingId(null)}>Cancel</button><button className="button button-primary" type="submit" disabled={isPending || !draftName.trim()}>Save</button></div>
                  </form>
                ) : (
                  <>
                    <div><h2>{item.name}</h2><time dateTime={item.updatedAt}>Updated {dateFormatter.format(new Date(item.updatedAt))}</time></div>
                    <div className="library-card-actions"><button type="button" disabled={isPending} onClick={() => beginRename(item)}>Rename</button><button className="is-danger" type="button" disabled={isPending} onClick={() => remove(item)}>Delete</button></div>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
