"use client";

/**
 * One filter popover, shared by every library (LIBRARIES.md §3).
 *
 * Deliberately a real fieldset of real checkboxes/radios rather than a custom
 * listbox: it is keyboard-operable and screen-reader-correct for free, and the
 * grouping is conveyed by the legend rather than by proximity alone.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { FilterDef } from "./types";

type Props<T> = {
  filter: FilterDef<T>;
  selected: string[];
  onChange: (values: string[]) => void;
};

export default function FilterMenu<T>({ filter, selected, onChange }: Props<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as globalThis.Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation(); // close this popover, don't also clear the selection
      setOpen(false);
      containerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  function toggleValue(value: string) {
    if (!filter.multiple) {
      onChange(selected[0] === value ? [] : [value]);
      return;
    }
    onChange(selected.includes(value)
      ? selected.filter((entry) => entry !== value)
      : [...selected, value]);
  }

  const count = selected.length;
  const summary = count === 0
    ? filter.label
    : count === 1
      ? filter.options.find((option) => option.value === selected[0])?.label ?? filter.label
      : `${filter.label}: ${count}`;

  return (
    <div className="lib-filter" ref={containerRef}>
      <button
        type="button"
        className={count ? "is-active" : undefined}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {summary}
        <span aria-hidden="true">▾</span>
        {count > 0 && <span className="sr-only">, {count} selected</span>}
      </button>

      {open && (
        <div className="lib-filter-panel" id={panelId}>
          <fieldset>
            <legend className="sr-only">{filter.label}</legend>
            {filter.options.length === 0 && (
              <p className="lib-filter-empty">Nothing to filter by yet.</p>
            )}
            {filter.options.map((option) => (
              <label key={option.value}>
                <input
                  type={filter.multiple ? "checkbox" : "radio"}
                  name={filter.multiple ? undefined : panelId}
                  checked={selected.includes(option.value)}
                  onChange={() => toggleValue(option.value)}
                />
                <span className="lib-filter-label">
                  {option.label}
                  {option.hint && <em>{option.hint}</em>}
                </span>
                {typeof option.count === "number" && (
                  <span className="lib-filter-count" aria-hidden="true">{option.count}</span>
                )}
                {typeof option.count === "number" && (
                  <span className="sr-only">, {option.count} items</span>
                )}
              </label>
            ))}
          </fieldset>
          {count > 0 && (
            <button type="button" className="lib-filter-reset" onClick={() => onChange([])}>
              Clear {filter.label.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
