"use client";

import Link from "next/link";
import SlideCanvas from "@/components/SlideCanvas";
import { useEffect, useMemo, useState } from "react";
import type { DeckSummary } from "@/lib/data/decks";

type View = "grid" | "table";
type Sort = "modified" | "created" | "title";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/Chicago",
});

const statusLabel: Record<DeckSummary["status"], string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
};

export default function DeckDashboard({ decks }: { decks: DeckSummary[] }) {
  const [view, setView] = useState<View>("grid");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("modified");

  useEffect(() => {
    const saved = localStorage.getItem("lu-dashboard-view");
    if (saved === "grid" || saved === "table") setView(saved);
  }, []);

  function chooseView(next: View) {
    setView(next);
    localStorage.setItem("lu-dashboard-view", next);
  }

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return decks
      .filter((deck) => !normalized || `${deck.title} ${deck.clientName} ${deck.eventName ?? ""}`.toLowerCase().includes(normalized))
      .sort((a, b) => {
        if (sort === "title") return a.title.localeCompare(b.title);
        const field = sort === "created" ? "createdAt" : "updatedAt";
        return b[field].localeCompare(a[field]);
      });
  }, [decks, query, sort]);

  const groups = useMemo(() => {
    const grouped = new Map<string, { name: string; decks: DeckSummary[] }>();
    for (const deck of visible) {
      const group = grouped.get(deck.clientId) ?? { name: deck.clientName, decks: [] };
      group.decks.push(deck);
      grouped.set(deck.clientId, group);
    }
    return [...grouped.entries()];
  }, [visible]);

  return (
    <>
      <section className="dashboard-toolbar" aria-label="Deck controls">
        <label className="search-field">
          <span className="sr-only">Search decks</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Search decks or clients" />
        </label>
        <label className="sort-field">
          <span>Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
            <option value="modified">Recently modified</option>
            <option value="created">Recently created</option>
            <option value="title">Title A–Z</option>
          </select>
        </label>
        <div className="view-toggle" aria-label="Dashboard view">
          <button type="button" aria-pressed={view === "grid"} onClick={() => chooseView("grid")}>Grid</button>
          <button type="button" aria-pressed={view === "table"} onClick={() => chooseView("table")}>Table</button>
        </div>
      </section>

      <p className="sr-only" aria-live="polite">{visible.length} decks shown</p>

      {!decks.length ? (
        <section className="empty-state">
          <p className="eyebrow">Your workspace is ready</p>
          <h2>Create the first pitch deck</h2>
          <p>Start with a client and title. We’ll add the first editable slide automatically.</p>
          <Link className="button button-primary" href="/decks/new">Create a deck</Link>
        </section>
      ) : !visible.length ? (
        <section className="empty-state">
          <h2>No matching decks</h2>
          <p>Try a different deck title, client, or event name.</p>
        </section>
      ) : (
        <div className="client-groups">
          {groups.map(([clientId, group]) => (
            <section className="client-group" key={clientId}>
              <div className="section-heading">
                <h2>{group.name}</h2>
                <span>{group.decks.length} {group.decks.length === 1 ? "deck" : "decks"}</span>
              </div>
              {view === "grid" ? (
                <div className="deck-grid">
                  {group.decks.map((deck) => <DeckCard deck={deck} key={deck.id} />)}
                </div>
              ) : (
                <DeckTable decks={group.decks} />
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function DeckCard({ deck }: { deck: DeckSummary }) {
  return (
    <article className="deck-card">
      {/* A real render of slide 1, not a text stand-in. Now that slides size
          themselves in container units, the same canvas renders correctly at
          any width — no separate thumbnail renderer, no image generation. */}
      <Link className="deck-thumbnail" href={`/decks/${deck.id}/edit/1`} aria-label={`Edit ${deck.title}`}>
        {deck.firstSlide
          ? <SlideCanvas doc={deck.firstSlide} theme={deck.themeDefault} />
          : <span className="deck-thumbnail-empty" data-theme={deck.themeDefault}>No slides yet</span>}
      </Link>
      <div className="deck-card-body">
        <div className="deck-title-row">
          <h3><Link href={`/decks/${deck.id}/edit/1`}>{deck.title}</Link></h3>
          <span className={`status status-${deck.status}`}>{statusLabel[deck.status]}</span>
        </div>
        <p>{deck.eventName ?? deck.clientName} · {deck.slideCount} {deck.slideCount === 1 ? "slide" : "slides"}</p>
        <time dateTime={deck.updatedAt}>Modified {dateFormatter.format(new Date(deck.updatedAt))}</time>
      </div>
    </article>
  );
}

function DeckTable({ decks }: { decks: DeckSummary[] }) {
  return (
    <div className="table-wrap">
      <table className="deck-table">
        <thead><tr><th>Deck</th><th>Status</th><th>Slides</th><th>Modified</th></tr></thead>
        <tbody>
          {decks.map((deck) => (
            <tr key={deck.id}>
              <th scope="row"><span><Link href={`/decks/${deck.id}/edit/1`}>{deck.title}</Link></span>{deck.eventName && <small>{deck.eventName}</small>}</th>
              <td><span className={`status status-${deck.status}`}>{statusLabel[deck.status]}</span></td>
              <td>{deck.slideCount}</td>
              <td><time dateTime={deck.updatedAt}>{dateFormatter.format(new Date(deck.updatedAt))}</time></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
