"use client";

/**
 * The shared library shell (LIBRARIES.md §3).
 *
 * Owns: search, filters, sort, view mode, selection, range-select, bulk actions,
 * pagination, URL sync, and every empty state. Callers own only what their items
 * look like.
 *
 * Toolbar layout is one row by default: search, the drafts switch, the combined
 * filter panel, then view controls pushed right. Active filters appear as
 * removable pills on a second row only when there are any, so the header does
 * not reserve height it is not using.
 *
 * State placement:
 *   - search / filters / page → URL params, so a filtered view is a link you can
 *     paste to a coworker and the back button works.
 *   - sort / view mode / page size → localStorage per library. Personal
 *     preferences that should survive a visit, not clutter a shared URL.
 *   - selection → never persisted; cleared on filter change, and announced.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import FilterPanel from "./FilterPanel";
import { PAGE_SIZES, VIEW_LABELS, type LibraryShellProps, type Selection, type ViewMode } from "./types";

const VIEW_ICONS: Record<ViewMode, string> = { grid: "▦", list: "☰", card: "▤", gallery: "◫" };

function readLocal(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeLocal(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* private mode — a default is a fine outcome */ }
}

export default function LibraryShell<T extends { id: string }>({
  title, description, items, searchText, views, renderView, filters = [], draftToggle,
  sorts, sortHiddenForViews = [], bulkActions = [], addActions = [], storageKey,
  breadcrumbs, notice, emptyState, noResultsState,
}: LibraryShellProps<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const baseId = useId();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastToggledIndex = useRef<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [announcement, setAnnouncement] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);

  /* ------------------------- URL-backed state ------------------------- */

  const query = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const hideDrafts = params.get("approved") === "1";

  const activeFilters = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const filter of filters) {
      const raw = params.get(filter.id);
      if (raw) map.set(filter.id, raw.split(",").filter(Boolean));
    }
    return map;
  }, [filters, params]);

  const setParams = useCallback((updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    startTransition(() => {
      router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
    });
  }, [params, pathname, router]);

  /* ------------------- Remembered preferences (local) ------------------ */

  const [view, setView] = useState<ViewMode>(views[0]);
  const [sortId, setSortId] = useState(sorts[0]?.id ?? "");
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);

  useEffect(() => {
    const storedView = readLocal(`library-view:${storageKey}`) as ViewMode | null;
    if (storedView && views.includes(storedView)) setView(storedView);

    const storedSort = readLocal(`library-sort:${storageKey}`);
    if (storedSort && sorts.some((sort) => sort.id === storedSort)) setSortId(storedSort);

    const storedSize = Number(readLocal(`library-page-size:${storageKey}`));
    if (PAGE_SIZES.includes(storedSize as (typeof PAGE_SIZES)[number])) setPageSize(storedSize);
    // Preferences are read once on mount; later changes go through the setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function chooseView(mode: ViewMode) {
    setView(mode);
    writeLocal(`library-view:${storageKey}`, mode);
  }
  function chooseSort(id: string) {
    setSortId(id);
    writeLocal(`library-sort:${storageKey}`, id);
  }
  function choosePageSize(size: number) {
    setPageSize(size);
    writeLocal(`library-page-size:${storageKey}`, String(size));
    setParams({ page: null });
  }

  /* --------------------------- Derived list --------------------------- */

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let result = items;

    // Everything shows by default; the switch narrows to approved only.
    if (draftToggle && hideDrafts) result = result.filter((item) => !draftToggle.isDraft(item));

    if (needle) result = result.filter((item) => searchText(item).toLowerCase().includes(needle));

    for (const filter of filters) {
      const values = activeFilters.get(filter.id);
      if (!values?.length) continue;
      // Values within one filter are OR; separate filters are AND — what people
      // expect from "Case study OR Intro" plus "Needs tagging".
      result = result.filter((item) => values.some((value) => filter.matches(item, value)));
    }

    const sort = sorts.find((entry) => entry.id === sortId) ?? sorts[0];
    return sort ? [...result].sort(sort.compare) : result;
  }, [items, query, searchText, filters, activeFilters, sorts, sortId, draftToggle, hideDrafts]);

  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(filteredItems.length / pageSize)) : 1;
  const currentPage = Math.min(page, totalPages);
  const visibleItems = useMemo(() => (
    pageSize > 0
      ? filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize)
      : filteredItems
  ), [filteredItems, currentPage, pageSize]);

  const visibleIdList = useMemo(() => visibleItems.map((item) => item.id), [visibleItems]);

  /* ----------------------------- Pills -------------------------------- */

  const activePills = useMemo(() => {
    const pills: Array<{ key: string; label: string; remove: () => void }> = [];

    if (query) {
      pills.push({ key: "q", label: `“${query}”`, remove: () => {
        setParams({ q: null, page: null });
        if (searchInputRef.current) searchInputRef.current.value = "";
      } });
    }
    if (draftToggle && hideDrafts) {
      pills.push({ key: "approved", label: "Approved only", remove: () => setParams({ approved: null, page: null }) });
    }
    for (const filter of filters) {
      for (const value of activeFilters.get(filter.id) ?? []) {
        const option = filter.options.find((entry) => entry.value === value);
        pills.push({
          key: `${filter.id}:${value}`,
          label: `${filter.label}: ${option?.label ?? value}`,
          remove: () => {
            const rest = (activeFilters.get(filter.id) ?? []).filter((entry) => entry !== value);
            setParams({ [filter.id]: rest.length ? rest.join(",") : null, page: null });
          },
        });
      }
    }
    return pills;
  }, [query, filters, activeFilters, draftToggle, hideDrafts, setParams]);

  function clearAll() {
    const cleared: Record<string, string | null> = { q: null, page: null, approved: null };
    for (const filter of filters) cleared[filter.id] = null;
    setParams(cleared);
    if (searchInputRef.current) searchInputRef.current.value = "";
    setAnnouncement("All filters cleared.");
  }

  /* ---------------------------- Selection ----------------------------- */

  useEffect(() => {
    setSelectedIds((current) => {
      if (!current.size) return current;
      const visible = new Set(visibleIdList);
      const next = new Set([...current].filter((id) => visible.has(id)));
      if (next.size === current.size) return current;
      setAnnouncement(next.size
        ? `${next.size} still selected.`
        : "Selection cleared because the visible items changed.");
      return next;
    });
  }, [visibleIdList]);

  const toggle = useCallback((id: string, index: number, shiftKey = false) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      const anchor = lastToggledIndex.current;

      if (shiftKey && anchor !== null && anchor !== index) {
        const [from, to] = anchor < index ? [anchor, index] : [index, anchor];
        const shouldSelect = !next.has(id);
        for (let i = from; i <= to; i += 1) {
          const rangeId = visibleIdList[i];
          if (!rangeId) continue;
          if (shouldSelect) next.add(rangeId); else next.delete(rangeId);
        }
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      lastToggledIndex.current = index;
      return next;
    });
  }, [visibleIdList]);

  const selection: Selection = useMemo(() => ({
    ids: selectedIds,
    isSelected: (id) => selectedIds.has(id),
    toggle,
    clear: () => { setSelectedIds(new Set()); lastToggledIndex.current = null; },
  }), [selectedIds, toggle]);

  const selectedItems = useMemo(
    () => visibleItems.filter((item) => selectedIds.has(item.id)),
    [visibleItems, selectedIds],
  );

  const allVisibleSelected = visibleIdList.length > 0 && visibleIdList.every((id) => selectedIds.has(id));
  const someVisibleSelected = selectedIds.size > 0 && !allVisibleSelected;

  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someVisibleSelected;
  }, [someVisibleSelected]);

  /* ---------------------------- Shortcuts ----------------------------- */

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable
      );
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (event.key === "Escape") {
        if (addOpen) { setAddOpen(false); return; }
        if (selectedIds.size) { selection.clear(); setAnnouncement("Selection cleared."); }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [addOpen, selectedIds.size, selection]);

  /* --------------------------- Bulk actions --------------------------- */

  async function runBulkAction(actionId: string) {
    const action = bulkActions.find((entry) => entry.id === actionId);
    if (!action || !selectedItems.length || isPending) return;

    // The control stays focusable via aria-disabled, so the block is enforced
    // here — and it says why rather than doing nothing.
    const reason = action.disabledReason?.(selectedItems);
    if (reason) { setAnnouncement(reason); return; }

    if (action.destructive || action.confirm) {
      const body = action.confirm?.(selectedItems) ?? defaultConfirm(action.label, selectedItems);
      if (!window.confirm(body)) return;
    }

    try {
      const message = await action.run(selectedItems);
      setAnnouncement(message);
      selection.clear();
      startTransition(() => router.refresh());
    } catch (error) {
      console.error(`Bulk action "${actionId}" failed`, error);
      setAnnouncement(`${action.label} did not finish. Nothing was changed — try again.`);
    }
  }

  /* ------------------------------ Render ------------------------------ */

  const hasItems = items.length > 0;
  const hasResults = filteredItems.length > 0;
  const showSort = sorts.length > 1 && !sortHiddenForViews.includes(view);

  return (
    <section className="lib" aria-label={title}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="lib-breadcrumbs" aria-label="Breadcrumb">
          <ol>
            {breadcrumbs.map((crumb, index) => (
              <li key={crumb.label} aria-current={index === breadcrumbs.length - 1 ? "page" : undefined}>
                {crumb.href && index < breadcrumbs.length - 1
                  ? <Link href={crumb.href}>{crumb.label}</Link>
                  : crumb.label}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <header className="lib-header">
        <div className="lib-header-text">
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {addActions.length > 0 && (
          <div className="lib-add">
            <button
              type="button" className="button button-primary"
              aria-expanded={addOpen} aria-haspopup="menu"
              onClick={() => setAddOpen((open) => !open)}
            >
              Add <span aria-hidden="true">▾</span>
            </button>
            {addOpen && (
              <div className="lib-add-menu" role="menu" onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node)) setAddOpen(false);
              }}>
                {addActions.map((action) => action.comingSoon ? (
                  <p key={action.id} className="lib-add-soon">
                    <strong>{action.label}</strong>
                    <span>{action.hint ?? "Coming soon"}</span>
                  </p>
                ) : action.href ? (
                  <Link key={action.id} role="menuitem" href={action.href} onClick={() => setAddOpen(false)}>
                    <strong>{action.label}</strong>{action.hint && <span>{action.hint}</span>}
                  </Link>
                ) : (
                  <button key={action.id} role="menuitem" type="button"
                    onClick={() => { action.onSelect?.(); setAddOpen(false); }}>
                    <strong>{action.label}</strong>{action.hint && <span>{action.hint}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </header>

      {notice && <p className="library-status" role="status">{notice}</p>}

      <search className="lib-toolbar">
        <label className="search-field lib-search">
          <span className="sr-only">Search {title.toLowerCase()}</span>
          <input
            ref={searchInputRef} type="search" defaultValue={query}
            placeholder="Search…  (press / )"
            onChange={(event) => setParams({ q: event.target.value || null, page: null })}
          />
        </label>

        {draftToggle && (
          /* Subtractive switch: off shows everything, on narrows to approved.
             One control, one effect, and no combination produces a draft-only
             list someone could ship from (LIBRARIES.md §4.2). */
          <label className="lib-switch">
            <input
              type="checkbox" role="switch" checked={hideDrafts}
              onChange={(event) => setParams({ approved: event.target.checked ? "1" : null, page: null })}
            />
            <span className="lib-switch-track" aria-hidden="true"><span /></span>
            <span className="lib-switch-label">
              {draftToggle.label}
              {/* The count only means something once the switch is on, where it
                  says how much is being held back. Off, everything is showing
                  and a number there would just be a puzzle. */}
              {hideDrafts && draftToggle.draftCount > 0 && (
                <>
                  <span className="lib-switch-count" aria-hidden="true">{draftToggle.draftCount} hidden</span>
                  <span className="sr-only">, hiding {draftToggle.draftCount} unapproved</span>
                </>
              )}
            </span>
          </label>
        )}

        {filters.length > 0 && (
          <FilterPanel
            filters={filters}
            selected={activeFilters}
            onChange={(id, values) => setParams({ [id]: values.length ? values.join(",") : null, page: null })}
            onClearAll={clearAll}
          />
        )}

        <div className="lib-toolbar-end">
          {views.length > 1 && (
            <div className="lib-views" role="radiogroup" aria-label="View as">
              {views.map((mode) => (
                <button
                  key={mode} type="button" role="radio"
                  aria-checked={view === mode}
                  tabIndex={view === mode ? 0 : -1}
                  className={view === mode ? "is-active" : undefined}
                  onClick={() => chooseView(mode)}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                    event.preventDefault();
                    const step = event.key === "ArrowRight" ? 1 : -1;
                    chooseView(views[(views.indexOf(view) + step + views.length) % views.length]);
                  }}
                >
                  <span aria-hidden="true">{VIEW_ICONS[mode]}</span>
                  <span className="sr-only">{VIEW_LABELS[mode]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </search>

      {activePills.length > 0 && (
        <div className="lib-pills">
          <span className="lib-pills-label">Filtered by</span>
          {activePills.map((pill) => (
            <button key={pill.key} type="button" className="lib-pill" onClick={pill.remove}>
              {pill.label}
              <span aria-hidden="true">✕</span>
              <span className="sr-only">, remove this filter</span>
            </button>
          ))}
          <button type="button" className="lib-pills-clear" onClick={clearAll}>Clear all</button>
        </div>
      )}

      {/* Sort sits below the toolbar and only for views that do not sort from
          their own headers — a table header IS the sort control, and two
          competing controls is worse than one. */}
      {showSort && hasResults && (
        <div className="lib-subbar">
          <label className="sort-field">
            <span>Sort</span>
            <select value={sortId} onChange={(event) => chooseSort(event.target.value)}>
              {sorts.map((sort) => <option key={sort.id} value={sort.id}>{sort.label}</option>)}
            </select>
          </label>
        </div>
      )}

      {bulkActions.length > 0 && selectedIds.size > 0 && (
        <div className="lib-selection" role="toolbar" aria-label={`Actions for ${selectedIds.size} selected`}>
          <label className="lib-selection-all">
            <input
              ref={selectAllRef} type="checkbox" checked={allVisibleSelected}
              onChange={() => {
                if (allVisibleSelected) { selection.clear(); setAnnouncement("Selection cleared."); }
                else { setSelectedIds(new Set(visibleIdList)); setAnnouncement(`${visibleIdList.length} selected.`); }
              }}
            />
            <span>{selectedIds.size} selected</span>
          </label>
          <div className="lib-selection-actions">
            {bulkActions.map((action) => {
              const reason = action.disabledReason?.(selectedItems) ?? null;
              return (
                <button
                  key={action.id} type="button"
                  className={action.destructive ? "is-danger" : undefined}
                  /* aria-disabled rather than `disabled`: a disabled button is
                     removed from the tab order, so the reason attached to it
                     could never be reached or announced. */
                  aria-disabled={Boolean(reason) || isPending}
                  data-disabled={Boolean(reason) || isPending || undefined}
                  title={reason ?? undefined}
                  aria-describedby={reason ? `${baseId}-${action.id}-why` : undefined}
                  onClick={() => runBulkAction(action.id)}
                >
                  {action.label}
                  {reason && <span id={`${baseId}-${action.id}-why`} className="sr-only">{reason}</span>}
                </button>
              );
            })}
          </div>
          <button type="button" className="lib-selection-clear" onClick={() => {
            selection.clear(); setAnnouncement("Selection cleared.");
          }}>
            <span aria-hidden="true">✕</span><span className="sr-only">Clear selection</span>
          </button>
        </div>
      )}

      {/* One live region, not two competing ones. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement || `${filteredItems.length} of ${items.length} shown.`}
      </p>

      {!hasItems ? (
        <div className="empty-state">
          <p className="eyebrow">Nothing here yet</p>
          <h2>{emptyState.heading}</h2>
          <p>{emptyState.body}</p>
          {emptyState.action}
        </div>
      ) : !hasResults ? (
        <div className="empty-state">
          <h2>{noResultsState?.heading ?? "No matches"}</h2>
          <p>{noResultsState?.body ?? "Try a different search, or clear the filters to see everything again."}</p>
          <button type="button" className="button button-secondary" onClick={clearAll}>Clear all filters</button>
        </div>
      ) : (
        <>
          <div className="lib-results" data-view={view} data-pending={isPending || undefined}>
            {renderView(view, visibleItems, selection)}
          </div>

          <div className="lib-footer">
            <p className="lib-count">
              {pageSize > 0 && filteredItems.length > pageSize
                ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filteredItems.length)} of ${filteredItems.length}`
                : `${filteredItems.length} ${filteredItems.length === 1 ? "item" : "items"}`}
              {filteredItems.length !== items.length && ` (filtered from ${items.length})`}
            </p>

            <label className="lib-page-size">
              <span>Per page</span>
              <select value={pageSize} onChange={(event) => choosePageSize(Number(event.target.value))}>
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>{size === 0 ? "All" : size}</option>
                ))}
              </select>
            </label>

            {totalPages > 1 && (
              <nav className="lib-pagination" aria-label="Pagination">
                <button
                  type="button" aria-disabled={currentPage === 1} data-disabled={currentPage === 1 || undefined}
                  onClick={() => currentPage > 1 && setParams({ page: String(currentPage - 1) })}
                >
                  <span aria-hidden="true">‹</span><span className="sr-only">Previous page</span>
                </button>
                {pageNumbers(currentPage, totalPages).map((entry, index) => entry === "gap" ? (
                  <span key={`gap-${index}`} className="lib-pagination-gap" aria-hidden="true">…</span>
                ) : (
                  <button
                    key={entry} type="button"
                    aria-current={entry === currentPage ? "page" : undefined}
                    className={entry === currentPage ? "is-current" : undefined}
                    onClick={() => setParams({ page: String(entry) })}
                  >
                    <span className="sr-only">Page </span>{entry}
                  </button>
                ))}
                <button
                  type="button" aria-disabled={currentPage === totalPages} data-disabled={currentPage === totalPages || undefined}
                  onClick={() => currentPage < totalPages && setParams({ page: String(currentPage + 1) })}
                >
                  <span aria-hidden="true">›</span><span className="sr-only">Next page</span>
                </button>
              </nav>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/** First, last, and a window around the current page. Keeps the control a fixed
 *  width once a library gets long. */
function pageNumbers(current: number, total: number): Array<number | "gap"> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);

  const result: Array<number | "gap"> = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) result.push("gap");
    result.push(page);
    previous = page;
  }
  return result;
}

function defaultConfirm(label: string, items: Array<{ id: string }>): string {
  const named = items as Array<{ id: string; name?: string }>;
  // Naming them helps while the list is readable; past that a count is clearer
  // than a wall of text.
  if (named.length <= 4 && named.every((item) => item.name)) {
    return `${label} ${named.length} ${named.length === 1 ? "item" : "items"}: ${named.map((i) => i.name).join(", ")}?`;
  }
  return `${label} ${named.length} items?`;
}
