"use client";

/**
 * The companies library (LIBRARIES.md §4.1) — v1 slice.
 *
 * Super basic on purpose: identity fields and a deck count, browsable through
 * the same shared shell as the content block library. No detail page, no
 * contacts, no CRM linkage, no add/edit flow yet — companies are still created
 * inline from "New deck" (see CreateDeckForm). Those are real §4.1 scope, just
 * not this pass.
 *
 * The list view is a plain table rather than the shared `DataTable` — that
 * component's checkbox column exists to drive bulk actions, and there are none
 * here yet. A selectable row that leads nowhere is worse than no checkbox.
 */
import LibraryShell from "./LibraryShell";
import type { SortDef } from "./types";
import type { CompanySummary } from "@/lib/data/companies";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago",
});

function websiteLabel(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function CompanyLogo({ company }: { company: CompanySummary }) {
  if (!company.logoUrl) {
    return <div className="lib-company-logo"><span className="lib-company-logo-placeholder" aria-hidden="true">{company.name.slice(0, 2).toUpperCase()}</span></div>;
  }
  return (
    <div className="lib-company-logo">
      {/* Company logos are user-provided URLs, same as slide images. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={company.logoUrl} alt="" />
    </div>
  );
}

function CompanyCard({ company }: { company: CompanySummary }) {
  return (
    <article className="lib-company-card">
      <CompanyLogo company={company} />
      <div>
        <h2 className="lib-company-name">{company.name}</h2>
        <p className="lib-company-meta">
          <span>{company.industry ?? <span className="lib-muted">No industry set</span>}</span>
          <span aria-hidden="true">·</span>
          <span>{company.deckCount > 0 ? `${company.deckCount} ${company.deckCount === 1 ? "deck" : "decks"}` : "No decks yet"}</span>
        </p>
        {company.website && (
          <p className="lib-company-meta">
            <a href={company.website} target="_blank" rel="noreferrer">{websiteLabel(company.website)}</a>
          </p>
        )}
      </div>
    </article>
  );
}

function CompanyTable({ items }: { items: CompanySummary[] }) {
  return (
    <div className="lib-table-wrap">
      <div className="lib-table-scroll">
        <table className="lib-table">
          <caption className="sr-only">Companies, {items.length} shown</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Industry</th>
              <th scope="col">Website</th>
              <th scope="col" data-align="end">Decks</th>
              <th scope="col">Updated</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <th scope="row"><span className="lib-table-name">{item.name}</span></th>
                <td>{item.industry ?? <span className="lib-muted">—</span>}</td>
                <td>{item.website ? <a href={item.website} target="_blank" rel="noreferrer">{websiteLabel(item.website)}</a> : <span className="lib-muted">—</span>}</td>
                <td data-align="end">{item.deckCount || <span className="lib-muted">—</span>}</td>
                <td><time dateTime={item.updatedAt}>{dateFormatter.format(new Date(item.updatedAt))}</time></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CompanyLibrary({ items }: { items: CompanySummary[] }) {
  const sorts: SortDef<CompanySummary>[] = [
    { id: "name", label: "Name (A–Z)", compare: (a, b) => a.name.localeCompare(b.name) },
    { id: "updated", label: "Recently updated", compare: (a, b) => b.updatedAt.localeCompare(a.updatedAt) },
    { id: "created", label: "Recently added", compare: (a, b) => b.createdAt.localeCompare(a.createdAt) },
    { id: "decks", label: "Most decks", compare: (a, b) => b.deckCount - a.deckCount },
  ];

  return (
    <LibraryShell<CompanySummary>
      breadcrumbs={[{ label: "Decks", href: "/decks" }, { label: "Companies" }]}
      title="Companies"
      description="Every company with a deck, plus any added by hand. Open a company's decks from the dashboard search for now — a dedicated company page is next."
      items={items}
      storageKey="companies"
      searchText={(item) => [item.name, item.industry ?? "", item.website ?? ""].join(" ")}
      views={["list", "card"]}
      sorts={sorts}
      emptyState={{
        heading: "No companies yet",
        body: "Companies are created inline the first time you start a new deck for them.",
      }}
      noResultsState={{
        heading: "No companies match that search",
        body: "Try a different name or industry.",
      }}
      renderView={(mode, visible) =>
        mode === "card"
          ? <div className="lib-company-grid">{visible.map((item) => <CompanyCard company={item} key={item.id} />)}</div>
          : <CompanyTable items={visible} />
      }
    />
  );
}
