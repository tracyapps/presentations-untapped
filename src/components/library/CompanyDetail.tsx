"use client";

/**
 * The company edit screen (LIBRARIES.md §4.1) — closes the gap the "super
 * basic" v1 companies library shipped with: a company could be created
 * inline from "New deck" but never edited afterward.
 *
 * One combined save, deliberately: every editable field lives in one server
 * action (updateCompanyAction), so one form avoids the "which button actually
 * saved my branding edit" confusion a BlockDetail-style multi-form layout
 * would invite here. Notes and CRM identifiers ride along in the same form
 * for the same reason.
 *
 * Archiving, not deleting: `decks.client_id` is a restrict-on-delete FK, so a
 * company with decks can never be hard-deleted anyway. Archive reuses the
 * column getCompanies() already filters on, so "remove from my company list"
 * has a real, reversible action instead of a delete button that mostly fails.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CompanyDeckSummary, CompanyDetail as CompanyDetailType } from "@/lib/data/companies";
import { setCompanyArchivedAction, updateCompanyAction } from "@/app/companies/actions";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago",
});

const DECK_STATUS_LABEL: Record<CompanyDeckSummary["status"], string> = {
  draft: "Draft", in_review: "In review", approved: "Published",
};

function LogoPreview({ url, name }: { url: string; name: string }) {
  if (!url.trim()) {
    return <div className="lib-company-logo"><span className="lib-company-logo-placeholder" aria-hidden="true">{name.slice(0, 2).toUpperCase() || "—"}</span></div>;
  }
  return (
    <div className="lib-company-logo">
      {/* Preview of a user-provided URL, same as the card view. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" />
    </div>
  );
}

export default function CompanyDetail({ company, decks }: { company: CompanyDetailType; decks: CompanyDeckSummary[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [archivePending, startArchiveTransition] = useTransition();
  const [notice, setNotice] = useState("");

  const [name, setName] = useState(company.name);
  const [slug, setSlug] = useState(company.slug);
  const [website, setWebsite] = useState(company.website ?? "");
  const [industry, setIndustry] = useState(company.industry ?? "");
  const [logoUrl, setLogoUrl] = useState(company.logoUrl ?? "");
  const [logoDarkUrl, setLogoDarkUrl] = useState(company.logoDarkUrl ?? "");
  const [logoMarkUrl, setLogoMarkUrl] = useState(company.logoMarkUrl ?? "");
  const [brandPrimary, setBrandPrimary] = useState(company.brandPrimary ?? "");
  const [brandSecondary, setBrandSecondary] = useState(company.brandSecondary ?? "");
  const [bitrixId, setBitrixId] = useState(company.bitrixId ?? "");
  const [airtableBaseId, setAirtableBaseId] = useState(company.airtableBaseId ?? "");
  const [airtableTableId, setAirtableTableId] = useState(company.airtableTableId ?? "");
  const [airtableRecordId, setAirtableRecordId] = useState(company.airtableRecordId ?? "");
  const [notes, setNotes] = useState(company.notes ?? "");

  const isArchived = Boolean(company.archivedAt);

  const dirty = name !== company.name
    || slug !== company.slug
    || website !== (company.website ?? "")
    || industry !== (company.industry ?? "")
    || logoUrl !== (company.logoUrl ?? "")
    || logoDarkUrl !== (company.logoDarkUrl ?? "")
    || logoMarkUrl !== (company.logoMarkUrl ?? "")
    || brandPrimary !== (company.brandPrimary ?? "")
    || brandSecondary !== (company.brandSecondary ?? "")
    || bitrixId !== (company.bitrixId ?? "")
    || airtableBaseId !== (company.airtableBaseId ?? "")
    || airtableTableId !== (company.airtableTableId ?? "")
    || airtableRecordId !== (company.airtableRecordId ?? "")
    || notes !== (company.notes ?? "");

  function save() {
    startTransition(async () => {
      const result = await updateCompanyAction({
        id: company.id, name, slug, website, industry,
        logoUrl, logoDarkUrl, logoMarkUrl, brandPrimary, brandSecondary,
        bitrixId, airtableBaseId, airtableTableId, airtableRecordId, notes,
      });
      setNotice(result.message ?? (result.status === "error" ? "Something went wrong." : "Saved."));
      if (result.status === "complete") router.refresh();
    });
  }

  function toggleArchive() {
    if (!isArchived && !window.confirm(`Archive “${company.name}”? It will drop off the companies list, but nothing else changes — you can restore it any time from this page.`)) return;
    startArchiveTransition(async () => {
      const result = await setCompanyArchivedAction({ id: company.id, archived: !isArchived });
      setNotice(result.message ?? (result.status === "error" ? "Something went wrong." : ""));
      if (result.status === "complete") router.refresh();
    });
  }

  return (
    <div className="lib-detail">
      <nav className="lib-breadcrumbs" aria-label="Breadcrumb">
        <ol>
          <li><Link href="/decks">Decks</Link></li>
          <li><Link href="/companies">Companies</Link></li>
          <li aria-current="page">{company.name}</li>
        </ol>
      </nav>

      <header className="lib-detail-header">
        <div>
          <h1>{company.name}</h1>
          <p className="lib-detail-sub">
            {isArchived && (
              <span className="lib-status-pill" data-status="draft">
                <span aria-hidden="true">◌</span> Archived
              </span>
            )}
            <span>{company.industry ?? "No industry set"}</span>
            <span aria-hidden="true">·</span>
            <span>{company.deckCount > 0 ? `${company.deckCount} ${company.deckCount === 1 ? "deck" : "decks"}` : "No decks yet"}</span>
          </p>
        </div>
        <Link className="button button-secondary" href="/companies">Back to companies</Link>
      </header>

      {notice && <p className="library-status" role="status">{notice}</p>}

      <form
        className="lib-detail-grid"
        onSubmit={(event) => { event.preventDefault(); save(); }}
      >
        <div className="lib-detail-col">
          <section className="lib-panel" aria-labelledby="details-heading">
            <div className="lib-panel-head"><h2 id="details-heading">Details</h2></div>
            <div className="lib-form">
              <label className="field">
                <span>Name</span>
                <input value={name} maxLength={150} onChange={(event) => setName(event.target.value)} required />
              </label>
              <label className="field">
                <span>Slug <em>Used in every deck&rsquo;s public link (/p/{slug || "…"}/…) — changing it breaks links already sent out</em></span>
                <input value={slug} maxLength={64} onChange={(event) => setSlug(event.target.value)} />
              </label>
              <label className="field">
                <span>Website</span>
                <input value={website} type="url" placeholder="https://…" onChange={(event) => setWebsite(event.target.value)} />
              </label>
              <label className="field">
                <span>Industry</span>
                <input value={industry} maxLength={80} onChange={(event) => setIndustry(event.target.value)} />
              </label>
            </div>
          </section>

          <section className="lib-panel" aria-labelledby="branding-heading">
            <div className="lib-panel-head"><h2 id="branding-heading">Branding</h2></div>
            <p className="lib-panel-note">
              Reference only — these do not feed the deck theme, since a client&rsquo;s raw brand
              color usually isn&rsquo;t contrast-tested for our themes.
            </p>
            <div className="lib-form">
              <label className="field">
                <span>Logo <em>Light background</em></span>
                <div className="lib-logo-field">
                  <LogoPreview url={logoUrl} name={name} />
                  <input value={logoUrl} type="url" placeholder="https://…" onChange={(event) => setLogoUrl(event.target.value)} />
                </div>
              </label>
              <label className="field">
                <span>Logo <em>Dark background</em></span>
                <div className="lib-logo-field">
                  <LogoPreview url={logoDarkUrl} name={name} />
                  <input value={logoDarkUrl} type="url" placeholder="https://…" onChange={(event) => setLogoDarkUrl(event.target.value)} />
                </div>
              </label>
              <label className="field">
                <span>Logo mark <em>Icon only</em></span>
                <div className="lib-logo-field">
                  <LogoPreview url={logoMarkUrl} name={name} />
                  <input value={logoMarkUrl} type="url" placeholder="https://…" onChange={(event) => setLogoMarkUrl(event.target.value)} />
                </div>
              </label>
              <label className="field">
                <span>Brand primary color</span>
                <div className="lib-color-field">
                  <span className="lib-color-swatch" style={{ background: brandPrimary || undefined }} aria-hidden="true" />
                  <input value={brandPrimary} maxLength={20} placeholder="#0057B8" onChange={(event) => setBrandPrimary(event.target.value)} />
                </div>
              </label>
              <label className="field">
                <span>Brand secondary color</span>
                <div className="lib-color-field">
                  <span className="lib-color-swatch" style={{ background: brandSecondary || undefined }} aria-hidden="true" />
                  <input value={brandSecondary} maxLength={20} placeholder="#F2A900" onChange={(event) => setBrandSecondary(event.target.value)} />
                </div>
              </label>
            </div>
          </section>
        </div>

        <div className="lib-detail-col is-wide">
          <section className="lib-panel" aria-labelledby="decks-heading">
            <div className="lib-panel-head">
              <h2 id="decks-heading">Decks</h2>
              <Link className="button button-secondary" href="/decks/new">New deck</Link>
            </div>
            {decks.length === 0 ? (
              <p className="lib-panel-note">No decks yet for this company.</p>
            ) : (
              <div className="lib-table-wrap">
                <div className="lib-table-scroll">
                  <table className="lib-table">
                    <caption className="sr-only">Decks for {company.name}, {decks.length} shown</caption>
                    <thead>
                      <tr>
                        <th scope="col">Title</th>
                        <th scope="col">Status</th>
                        <th scope="col">Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {decks.map((deck) => (
                        <tr key={deck.id}>
                          <th scope="row">
                            <Link className="lib-table-name" href={`/decks/${deck.id}/edit/1`}>{deck.title}</Link>
                          </th>
                          <td>
                            <span className="lib-status-pill" data-status={deck.status}>
                              {DECK_STATUS_LABEL[deck.status]}
                            </span>
                          </td>
                          <td><time dateTime={deck.updatedAt}>{dateFormatter.format(new Date(deck.updatedAt))}</time></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <section className="lib-panel" aria-labelledby="notes-heading">
            <div className="lib-panel-head"><h2 id="notes-heading">Internal notes</h2></div>
            <div className="lib-form">
              <label className="field">
                <span className="sr-only">Internal notes</span>
                <textarea rows={5} maxLength={4000} value={notes}
                  placeholder="Anything worth knowing before the next deck for this company…"
                  onChange={(event) => setNotes(event.target.value)} />
              </label>
            </div>
          </section>
        </div>

        <div className="lib-detail-col">
          <section className="lib-panel" aria-labelledby="crm-heading">
            <div className="lib-panel-head"><h2 id="crm-heading">CRM identifiers</h2></div>
            <p className="lib-panel-note">v1: identifiers only, no live sync yet.</p>
            <div className="lib-form">
              <label className="field">
                <span>Bitrix ID</span>
                <input value={bitrixId} maxLength={100} onChange={(event) => setBitrixId(event.target.value)} />
              </label>
              <label className="field">
                <span>Airtable base ID</span>
                <input value={airtableBaseId} maxLength={100} onChange={(event) => setAirtableBaseId(event.target.value)} />
              </label>
              <label className="field">
                <span>Airtable table ID</span>
                <input value={airtableTableId} maxLength={100} onChange={(event) => setAirtableTableId(event.target.value)} />
              </label>
              <label className="field">
                <span>Airtable record ID</span>
                <input value={airtableRecordId} maxLength={100} onChange={(event) => setAirtableRecordId(event.target.value)} />
              </label>
            </div>
          </section>

          <section className="lib-panel" aria-labelledby="history-heading">
            <div className="lib-panel-head"><h2 id="history-heading">History</h2></div>
            <dl className="lib-meta-list">
              <dt>Added</dt>
              <dd><time dateTime={company.createdAt}>{dateFormatter.format(new Date(company.createdAt))}</time></dd>
              <dt>Last edited</dt>
              <dd><time dateTime={company.updatedAt}>{dateFormatter.format(new Date(company.updatedAt))}</time></dd>
            </dl>
          </section>

          <section className="lib-panel is-danger-zone" aria-labelledby="danger-heading">
            <div className="lib-panel-head"><h2 id="danger-heading">{isArchived ? "Restore this company" : "Archive this company"}</h2></div>
            <p className="lib-panel-note">
              {isArchived
                ? "Archived companies are hidden from the companies list but keep every deck and detail."
                : "Removes this company from the companies list. Reversible any time — nothing is deleted."}
            </p>
            <button
              type="button" className={isArchived ? "button button-secondary" : "button button-danger"}
              aria-disabled={archivePending} data-disabled={archivePending || undefined}
              onClick={toggleArchive}
            >
              {isArchived ? "Restore company" : "Archive company"}
            </button>
          </section>
        </div>

        <div className="lib-form-actions" style={{ gridColumn: "1 / -1" }}>
          <button type="submit" className="button button-primary"
            aria-disabled={!dirty || isPending} data-disabled={!dirty || isPending || undefined}>
            Save changes
          </button>
          {dirty && <span className="lib-dirty">Unsaved changes</span>}
        </div>
      </form>
    </div>
  );
}
