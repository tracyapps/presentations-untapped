"use client";

/**
 * The shared library shell (LIBRARIES.md §3).
 *
 * Owns: search, filters, sort, view mode, selection, range-select, bulk actions,
 * URL sync, and every empty/loading state. Callers own only what their items
 * look like.
 *
 * State placement is deliberate:
 *   - search / filters / sort → URL params, so a filtered view is a link you can
 *     paste to a coworker and the back button works.
 *   - view mode → localStorage per library, because it is a personal preference
 *     and does not belong in a shared URL.
 *   - selection → never persisted; cleared on filter change, with the change
 *     announced rather than silent.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import FilterMenu from "./FilterMenu";
import { VIEW_LABELS, type LibraryShellProps, type Selection, type ViewMode } from "./types";

const VIEW_ICONS: Record<ViewMode, string> = {
  grid: "▦", list: "☰", card: "▤", gallery: "◫",
};

export default function LibraryShell<T extends { id: string }>({
  title, description, items, searchText, views, renderView, filters = [], sorts,
  bulkActions = [], addActions = [], storageKey, emptyState, noResultsState,
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
  const sortId = params.get("sort") ?? sorts[0]?.id ?? "";

  const activeFilters = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const filter of filters) {
      const raw = params.get(filter.id);
      if (raw) map.set(filter.id, raw.split(",").filter(Boolean));
    }
    return map;
  }, [filters, params]);

  const setParam = useCallback((key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    startTransition(() => {
      router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
    });
  }, [params, pathname, router]);

  /* ---------------------- View mode (localStorage) --------------------- */

  const [view, setView] = useState<ViewMode>(views[0]);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(`library-view:${storageKey}`) as ViewMode | null;
      if (stored && views.includes(stored)) setView(stored);
    } catch { /* private mode — the default view is a fine outcome */ }
  }, [storageKey, views]);

  function chooseView(mode: ViewMode) {
    setView(mode);
    try { window.localStorage.setItem(`library-view:${storageKey}`, mode); } catch { /* ignore */ }
  }

  /* --------------------------- Derived list --------------------------- */

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let result = items;

    if (needle) {
      result = result.filter((item) => searchText(item).toLowerCase().includes(needle));
    }

    for (const filter of filters) {
      const values = activeFilters.get(filter.id);
      if (!values?.length) continue;
      // Values within one filter are OR; separate filters are AND. That is what
      // people expect from "Case study OR Intro" + "Approved".
      result = result.filter((item) => values.some((value) => filter.matches(item, value)));
    }

    const sort = sorts.find((entry) => entry.id === sortId) ?? sorts[0];
    return sort ? [...result].sort(sort.compare) : result;
  }, [items, query, searchText, filters, activeFilters, sorts, sortId]);

  const visibleIdList = useMemo(() => visibleItems.map((item) => item.id), [visibleItems]);

  /* ---------------------------- Selection ----------------------------- */

  // Selection must never contain something the user cannot see acting on.
  useEffect(() => {
    setSelectedIds((current) => {
      if (!current.size) return current;
      const visible = new Set(visibleIdList);
      const next = new Set([...current].filter((id) => visible.has(id)));
      if (next.size === current.size) return current;
      setAnnouncement(next.size
        ? `${next.size} still selected after filtering.`
        : "Selection cleared because the filters changed.");
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

  function toggleSelectAll() {
    if (allVisibleSelected) {
      selection.clear();
      setAnnouncement("Selection cleared.");
    } else {
      setSelectedIds(new Set(visibleIdList));
      setAnnouncement(`${visibleIdList.length} selected.`);
    }
  }

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
  const hasResults = visibleItems.length > 0;
  const filtersActive = Boolean(query) || activeFilters.size > 0;

  return (
    <section className="lib" aria-label={title}>
      <header className="lib-header">
        <div>
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
                {addActions.map((action) => action.href ? (
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

      <search className="lib-toolbar">
        <div className="lib-toolbar-row">
          <label className="search-field lib-search">
            <span className="sr-only">Search {title.toLowerCase()}</span>
            <input
              ref={searchInputRef} type="search" defaultValue={query}
              placeholder="Search…  (press / )"
              onChange={(event) => setParam("q", event.target.value || null)}
            />
          </label>

          {filters.map((filter) => (
            <FilterMenu
              key={filter.id}
              filter={filter}
              selected={activeFilters.get(filter.id) ?? []}
              onChange={(values) => setParam(filter.id, values.length ? values.join(",") : null)}
            />
          ))}

          {filtersActive && (
            <button type="button" className="lib-clear" onClick={() => {
              startTransition(() => router.replace(pathname, { scroll: false }));
              setAnnouncement("Filters cleared.");
            }}>Clear filters</button>
          )}
        </div>

        <div className="lib-toolbar-row lib-toolbar-end">
          <label className="sort-field">
            <span>Sort</span>
            <select value={sortId} onChange={(event) => setParam("sort", event.target.value)}>
              {sorts.map((sort) => <option key={sort.id} value={sort.id}>{sort.label}</option>)}
            </select>
          </label>

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

      {bulkActions.length > 0 && selectedIds.size > 0 && (
        <div className="lib-selection" role="toolbar" aria-label={`Actions for ${selectedIds.size} selected`}>
          <label className="lib-selection-all">
            <input
              ref={selectAllRef} type="checkbox"
              checked={allVisibleSelected} onChange={toggleSelectAll}
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
                     removed from the tab order, so the reason attached to it can
                     never be reached or announced. This keeps it focusable and
                     explains itself; the click handler enforces the block. */
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
      <p className="lib-live sr-only" role="status" aria-live="polite">
        {announcement || `${visibleItems.length} of ${items.length} shown.`}
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
          <button type="button" className="button button-secondary" onClick={() => {
            startTransition(() => router.replace(pathname, { scroll: false }));
          }}>Clear filters</button>
        </div>
      ) : (
        <>
          <div className="lib-results" data-view={view} data-pending={isPending || undefined}>
            {renderView(view, visibleItems, selection)}
          </div>
          <p className="lib-count" aria-hidden="true">
            Showing {visibleItems.length} of {items.length}
          </p>
        </>
      )}
    </section>
  );
}

function defaultConfirm(label: string, items: Array<{ id: string }>): string {
  const named = items as Array<{ id: string; name?: string }>;
  // Naming them is only helpful while the list is readable; past that a count
  // is clearer than a wall of text.
  if (named.length <= 4 && named.every((item) => item.name)) {
    return `${label} ${named.length} ${named.length === 1 ? "item" : "items"}: ${named.map((i) => i.name).join(", ")}?`;
  }
  return `${label} ${named.length} items?`;
}
