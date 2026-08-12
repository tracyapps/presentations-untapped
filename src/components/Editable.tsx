"use client";

/**
 * Editing primitives shared by every block renderer.
 *
 * Before this, only the five text blocks (title, tagline, paragraph, blockquote
 * body, callout body) could be edited on the canvas. Stat values, list items,
 * process steps, table cells, pricing tiers, and chart data were readable but
 * not editable except through delimiter-separated textareas in Outline — where
 * a `|` inside someone's copy silently broke the row.
 *
 * Everything visible is now editable in place, and every repeatable collection
 * can grow and shrink.
 *
 * Accessibility rules these enforce so each block does not have to:
 *   - Every editable region has an explicit accessible name describing *which*
 *     field it is ("Step 2 title"), because "edit text" repeated fourteen times
 *     down a slide is useless.
 *   - Empty fields still occupy space and show a placeholder, so a blank cell
 *     is findable rather than a zero-width target.
 *   - Add and remove buttons name their subject, and removal is announced.
 */
import type { RichText } from "@/lib/slides/types";

export function plainText(value: RichText): string {
  return value.map((part) => part.text).join("");
}

/** Rich text run — preserves nothing but the string on edit, matching the
 *  existing behavior of direct canvas editing. */
export function InlineText({
  value, onChange, label, placeholder, className, multiline = false,
}: {
  value: RichText;
  onChange: (text: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
}) {
  return (
    <InlineString
      value={plainText(value)}
      onChange={onChange}
      label={label}
      placeholder={placeholder}
      className={className}
      multiline={multiline}
    />
  );
}

/**
 * A plain string edited in place.
 *
 * `plaintext-only` keeps pasted markup out of the document, and the commit
 * happens on blur so a controlled re-render never fights the caret — the single
 * most common bug in contentEditable fields.
 */
export function InlineString({
  value, onChange, label, placeholder, className, multiline = false,
}: {
  value: string;
  onChange: (text: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
}) {
  return (
    <span
      className={`direct-text-editor${className ? ` ${className}` : ""}`}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck
      dir="ltr"
      lang="en"
      role="textbox"
      aria-label={label}
      aria-multiline={multiline || undefined}
      data-placeholder={placeholder ?? label}
      data-empty={value ? undefined : true}
      tabIndex={0}
      onKeyDown={(event) => {
        // Enter commits a single-line field rather than inserting a newline
        // that the model would only throw away.
        if (event.key === "Enter" && !multiline) {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.currentTarget.innerText = value;
          event.currentTarget.blur();
        }
      }}
      onBlur={(event) => {
        const text = event.currentTarget.innerText.replace(/\n$/, "");
        if (text !== value) onChange(text);
      }}
    >{value}</span>
  );
}

/** A number edited in place. Kept as a real number input: a spinner and arrow
 *  keys are the right affordance for a value, and it validates for free. */
export function InlineNumber({
  value, onChange, label, className,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  className?: string;
}) {
  return (
    <input
      type="number"
      className={`direct-number-editor${className ? ` ${className}` : ""}`}
      value={value}
      aria-label={label}
      onChange={(event) => onChange(Number(event.target.value) || 0)}
    />
  );
}

/** Adds an entry to a repeatable collection. */
export function AddEntry({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="block-add-entry" onClick={onClick}>
      <span aria-hidden="true">＋</span> {label}
    </button>
  );
}

/**
 * Removes one entry. Disabled with a reason at the minimum count rather than
 * hidden — a control that vanishes reads as a bug, and "a table needs one row"
 * is a thing worth saying once.
 */
export function RemoveEntry({
  label, onClick, disabledReason,
}: {
  label: string;
  onClick: () => void;
  disabledReason?: string | null;
}) {
  return (
    <button
      type="button"
      className="block-remove-entry"
      aria-disabled={Boolean(disabledReason)}
      data-disabled={disabledReason ? true : undefined}
      title={disabledReason ?? label}
      onClick={() => { if (!disabledReason) onClick(); }}
    >
      <span aria-hidden="true">✕</span>
      <span className="sr-only">{disabledReason ? `${label} — ${disabledReason}` : label}</span>
    </button>
  );
}
