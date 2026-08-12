"use client";

/**
 * The shared table view (LIBRARIES.md §3.5).
 *
 * Sorting lives on the column headers rather than in the toolbar's Sort control,
 * because in a table the header IS the sort affordance — the shell hides its own
 * Sort for table views so there are never two competing controls.
 *
 * Column visibility and widths persist per library. Structural columns (select,
 * name) are marked `required` and cannot be hidden, so the table can never be
 * configured into uselessness.
 *
 * Resize handles are keyboard-operable: arrow keys nudge, Home resets. A
 * mouse-only resize is the usual way this pattern fails an audit.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ColumnDef, TableViewProps } from "./types";

type SortState = { columnId: string; direction: "asc" | "desc" } | null;

const DEFAULT_WIDTH = 160;
const MIN_WIDTH = 80;

function readJson<V>(key: string, fallback: V): V {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch { return fallback; }
}

export default function DataTable<T extends { id: string }>({
  items, columns, selection, storageKey, rowLabel, caption,
}: TableViewProps<T>) {
  const [sort, setSort] = useState<SortState>(null);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const resizing = useRef<{ columnId: string; startX: number; startWidth: number } | null>(null);

  /* ------------------------- Persisted settings ------------------------ */

  useEffect(() => {
    setHidden(readJson(`library-columns:${storageKey}`, Object.fromEntries(
      columns.filter((column) => column.defaultHidden).map((column) => [column.id, true]),
    ) as Record<string, boolean>));
    setWidths(readJson(`library-widths:${storageKey}`, {} as Record<string, number>));
    const storedSort = window.localStorage.getItem(`library-table-sort:${storageKey}`);
    if (storedSort) { try { setSort(JSON.parse(storedSort)); } catch { /* ignore */ } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const persist = useCallback((key: string, value: unknown) => {
    try { window.localStorage.setItem(`${key}:${storageKey}`, JSON.stringify(value)); } catch { /* ignore */ }
  }, [storageKey]);

  /* ------------------------------ Sorting ------------------------------ */

  function toggleSort(column: ColumnDef<T>) {
    if (!column.compare) return;
    const next: SortState = sort?.columnId === column.id
      ? (sort.direction === "asc"
          // asc → desc → off, so a header click can always get back to the
          // library's own default order without a reload.
          ? { columnId: column.id, direction: "desc" }
          : null)
      : { columnId: column.id, direction: "asc" };

    setSort(next);
    persist("library-table-sort", next);
    setAnnouncement(next
      ? `Sorted by ${column.label}, ${next.direction === "asc" ? "ascending" : "descending"}.`
      : "Sorting cleared.");
  }

  const visibleColumns = columns.filter((column) => !hidden[column.id]);

  const sortedItems = (() => {
    if (!sort) return items;
    const column = columns.find((entry) => entry.id === sort.columnId);
    if (!column?.compare) return items;
    const sorted = [...items].sort(column.compare);
    return sort.direction === "desc" ? sorted.reverse() : sorted;
  })();

  /* ----------------------------- Resizing ------------------------------ */

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const active = resizing.current;
      if (!active) return;
      const next = Math.max(MIN_WIDTH, active.startWidth + (event.clientX - active.startX));
      setWidths((current) => ({ ...current, [active.columnId]: next }));
    }
    function onUp() {
      if (!resizing.current) return;
      resizing.current = null;
      document.body.classList.remove("is-resizing-column");
      setWidths((current) => { persist("library-widths", current); return current; });
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
  }, [persist]);

  function nudgeWidth(column: ColumnDef<T>, delta: number) {
    setWidths((current) => {
      const next = {
        ...current,
        [column.id]: Math.max(column.minWidth ?? MIN_WIDTH, (current[column.id] ?? column.width ?? DEFAULT_WIDTH) + delta),
      };
      persist("library-widths", next);
      return next;
    });
  }

  function widthOf(column: ColumnDef<T>): number {
    return widths[column.id] ?? column.width ?? DEFAULT_WIDTH;
  }

  return (
    <div className="lib-table-wrap">
      <div className="lib-table-tools">
        <button type="button" className="lib-table-settings-trigger" onClick={() => setSettingsOpen(true)}>
          <span aria-hidden="true">⚙</span> Columns
          <span className="sr-only">, choose which columns to show</span>
        </button>
      </div>

      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      <div className="lib-table-scroll">
        <table className="lib-table">
          <caption className="sr-only">{caption}</caption>
          <colgroup>
            <col style={{ width: 44 }} />
            {visibleColumns.map((column) => <col key={column.id} style={{ width: widthOf(column) }} />)}
          </colgroup>
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Select</span></th>
              {visibleColumns.map((column) => {
                const isSorted = sort?.columnId === column.id;
                return (
                  <th
                    key={column.id} scope="col"
                    data-align={column.align}
                    aria-sort={isSorted ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {column.compare ? (
                      <button type="button" className="lib-th-sort" onClick={() => toggleSort(column)}>
                        {column.label}
                        <span aria-hidden="true" className="lib-th-arrow" data-state={isSorted ? sort.direction : "off"}>
                          {isSorted ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      </button>
                    ) : column.label}

                    <span
                      className="lib-col-resize"
                      role="separator"
                      tabIndex={0}
                      aria-orientation="vertical"
                      aria-label={`Resize ${column.label} column`}
                      aria-valuenow={widthOf(column)}
                      aria-valuemin={column.minWidth ?? MIN_WIDTH}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        resizing.current = { columnId: column.id, startX: event.clientX, startWidth: widthOf(column) };
                        document.body.classList.add("is-resizing-column");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowRight") { event.preventDefault(); nudgeWidth(column, 16); }
                        else if (event.key === "ArrowLeft") { event.preventDefault(); nudgeWidth(column, -16); }
                        else if (event.key === "Home") {
                          event.preventDefault();
                          setWidths((current) => {
                            const next = { ...current };
                            delete next[column.id];
                            persist("library-widths", next);
                            return next;
                          });
                        }
                      }}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item, index) => (
              <tr key={item.id} data-selected={selection.isSelected(item.id) || undefined}>
                <td>
                  <input
                    id={`row-${item.id}`} type="checkbox"
                    checked={selection.isSelected(item.id)}
                    onChange={(event) => selection.toggle(
                      item.id, index, (event.nativeEvent as MouseEvent).shiftKey,
                    )}
                  />
                  <label htmlFor={`row-${item.id}`} className="sr-only">Select {rowLabel(item)}</label>
                </td>
                {visibleColumns.map((column) => column.isRowHeader ? (
                  <th key={column.id} scope="row" data-align={column.align}>{column.render(item)}</th>
                ) : (
                  <td key={column.id} data-align={column.align}>{column.render(item)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {settingsOpen && (
        <ColumnSettings
          columns={columns}
          hidden={hidden}
          onToggle={(columnId, isHidden) => {
            setHidden((current) => {
              const next = { ...current, [columnId]: isHidden };
              persist("library-columns", next);
              return next;
            });
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function ColumnSettings<T>({
  columns, hidden, onToggle, onClose,
}: {
  columns: ColumnDef<T>[];
  hidden: Record<string, boolean>;
  onToggle: (columnId: string, hidden: boolean) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Remember where focus came from so it can go back — otherwise closing the
    // dialog drops a keyboard user at the top of the document.
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLInputElement>("input:not(:disabled), button")?.focus();

    function focusables(): HTMLElement[] {
      return [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        "input:not(:disabled), button:not(:disabled)",
      ) ?? [])];
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); return; }
      if (event.key !== "Tab") return;

      // aria-modal alone does not stop Tab reaching the page behind, so the
      // cycle is closed here.
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="lib-modal-backdrop" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="lib-modal" role="dialog" aria-modal="true" aria-labelledby="column-settings-title" ref={dialogRef}>
        <h2 id="column-settings-title">Columns</h2>
        <p>Choose what to show. Name and selection always stay visible.</p>
        <fieldset>
          <legend className="sr-only">Visible columns</legend>
          {columns.map((column) => (
            <label key={column.id}>
              <input
                type="checkbox"
                checked={!hidden[column.id]}
                disabled={column.required}
                onChange={(event) => onToggle(column.id, !event.target.checked)}
              />
              <span>{column.label}</span>
              {column.required && <em>Always shown</em>}
            </label>
          ))}
        </fieldset>
        <div className="lib-modal-actions">
          <button type="button" className="button button-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
