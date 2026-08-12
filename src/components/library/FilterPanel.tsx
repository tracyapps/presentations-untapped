"use client";

/**
 * One combined filter panel for every library (LIBRARIES.md §3.1).
 *
 * Previously each filter was its own dropdown, which wrapped onto a second row
 * as soon as a library had more than three of them. All groups now stack inside
 * a single popover: the toolbar stays one line, and the groups are legible as a
 * set rather than scattered.
 *
 * Deliberately real fieldsets of real checkboxes and radios — keyboard-operable
 * and screen-reader-correct for free, with grouping conveyed by the legend
 * rather than by proximity alone.
 */
import { useEffect, useRef, useState } from "react";
import type { FilterDef } from "./types";

type Props<T> = {
  filters: FilterDef<T>[];
  /** filter id → selected values */
  selected: Map<string, string[]>;
  onChange: (filterId: string, values: string[]) => void;
  onClearAll: () => void;
};

export default function FilterPanel<T>({ filters, selected, onChange, onClearAll }: Props<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const activeCount = [...selected.values()].reduce((total, values) => total + values.length, 0);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLInputElement>("input")?.focus();

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as globalThis.Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Close the panel without also clearing the shell's selection.
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  function toggleValue(filter: FilterDef<T>, value: string) {
    const current = selected.get(filter.id) ?? [];
    if (!filter.multiple) {
      onChange(filter.id, current[0] === value ? [] : [value]);
      return;
    }
    onChange(filter.id, current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value]);
  }

  return (
    <div className="lib-filter" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={activeCount ? "is-active" : undefined}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">⌗</span>
        Filters
        {activeCount > 0 && (
          <>
            <span className="lib-filter-badge" aria-hidden="true">{activeCount}</span>
            <span className="sr-only">, {activeCount} active</span>
          </>
        )}
      </button>

      {open && (
        <div className="lib-filter-panel" ref={panelRef}>
          {filters.map((filter) => {
            const values = selected.get(filter.id) ?? [];
            return (
              <fieldset key={filter.id}>
                <legend>{filter.label}</legend>
                {filter.options.length === 0 ? (
                  <p className="lib-filter-empty">Nothing to filter by yet.</p>
                ) : filter.options.map((option) => (
                  <label key={option.value}>
                    <input
                      type={filter.multiple ? "checkbox" : "radio"}
                      name={filter.multiple ? undefined : `filter-${filter.id}`}
                      checked={values.includes(option.value)}
                      onChange={() => toggleValue(filter, option.value)}
                    />
                    <span className="lib-filter-label">
                      {option.label}
                      {option.hint && <em>{option.hint}</em>}
                    </span>
                    {typeof option.count === "number" && (
                      <>
                        <span className="lib-filter-count" aria-hidden="true">{option.count}</span>
                        <span className="sr-only">, {option.count} items</span>
                      </>
                    )}
                  </label>
                ))}
              </fieldset>
            );
          })}

          {activeCount > 0 && (
            <button type="button" className="lib-filter-reset" onClick={onClearAll}>
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
