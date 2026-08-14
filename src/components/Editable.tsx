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
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { rangeHasMark, rangeSize, richTextLength, setRangeSize, toggleMark } from "@/lib/slides/rich-text";
import type { SizeChoice } from "@/lib/slides/rich-text";
import type { RichText } from "@/lib/slides/types";

export function plainText(value: RichText): string {
  return value.map((part) => part.text).join("");
}

/* ------------------------- DOM <-> RichText ---------------------------- */
/**
 * Everything below this line converts between the live contentEditable DOM
 * and a `RichText` run array. It exists because `InlineText` renders marks
 * as real nested elements (`<strong>`/`<em>`/`<span class="rich-sm|lg">`,
 * mirroring `Rich` in SlideCanvas.tsx) instead of the plain string
 * `InlineString` uses — formatting has to live somewhere, and a selection
 * toolbar needs real elements to select across.
 *
 * `\n` (not `<br>`/`<div>`) is the only line-break representation these
 * functions ever produce or expect; `insertTextAtCaret` is the one place
 * that inserts one, so parsing never has to guess how a browser chose to
 * represent a break.
 */

/** Character length of a node the same way `domToRichText` counts it —
 *  BR counts as one `\n`. Used both to walk to a target offset and as the
 *  corruption guard in `InlineText`'s commit. */
function textLength(node: globalThis.Node): number {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").length;
  if (node.nodeName === "BR") return 1;
  let sum = 0;
  node.childNodes.forEach((child) => { sum += textLength(child); });
  return sum;
}

type CharMarks = { bold?: boolean; italic?: boolean; size?: "sm" | "lg" };

/** Walks the live DOM under `container` into a RichText run array, reading
 *  bold/italic/size off ancestor tags rather than assuming any particular
 *  nesting — robust to however the browser actually shaped the edit. */
function domToRichText(container: HTMLElement): RichText {
  const runs: RichText = [];
  function visit(node: globalThis.Node, marks: CharMarks) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text) runs.push({ text, ...marks });
      return;
    }
    if (node.nodeName === "BR") {
      runs.push({ text: "\n", ...marks });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const next: CharMarks = { ...marks };
    if (el.tagName === "STRONG" || el.tagName === "B") next.bold = true;
    if (el.tagName === "EM" || el.tagName === "I") next.italic = true;
    if (el.classList.contains("rich-sm")) next.size = "sm";
    if (el.classList.contains("rich-lg")) next.size = "lg";
    node.childNodes.forEach((child) => visit(child, next));
  }
  container.childNodes.forEach((child) => visit(child, {}));
  return runs.length ? runs : [{ text: "" }];
}

/** Character offset of a native Range boundary (node, offset) relative to
 *  the start of `container`'s text. */
function offsetWithin(container: globalThis.Node, node: globalThis.Node, offset: number): number {
  let total = 0;
  let found: number | null = null;
  function walk(n: globalThis.Node): boolean {
    if (n === node) {
      if (n.nodeType === Node.TEXT_NODE) { found = total + offset; return true; }
      let index = 0;
      for (const child of Array.from(n.childNodes)) {
        if (index === offset) { found = total; return true; }
        total += textLength(child);
        index += 1;
      }
      found = total;
      return true;
    }
    if (n.nodeType === Node.TEXT_NODE) { total += (n.textContent ?? "").length; return false; }
    if (n.nodeName === "BR") { total += 1; return false; }
    for (const child of Array.from(n.childNodes)) {
      if (walk(child)) return true;
    }
    return false;
  }
  walk(container);
  return found ?? total;
}

/** The current selection's [start, end) in `container`'s character space,
 *  or null if there is no real (non-collapsed) selection inside it. */
function getSelectionOffsets(container: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return null;
  const a = offsetWithin(container, range.startContainer, range.startOffset);
  const b = offsetWithin(container, range.endContainer, range.endOffset);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

/** Finds the (node, offset) Range boundary `target` characters into
 *  `container`, for restoring a selection after a re-render. */
function locate(container: globalThis.Node, target: number): { node: globalThis.Node; offset: number } {
  let remaining = target;
  let result: { node: globalThis.Node; offset: number } | null = null;
  function walk(n: globalThis.Node): boolean {
    if (n.nodeType === Node.TEXT_NODE) {
      const len = (n.textContent ?? "").length;
      if (remaining <= len) { result = { node: n, offset: remaining }; return true; }
      remaining -= len;
      return false;
    }
    if (n.nodeName === "BR") {
      if (remaining <= 1) {
        const parent = n.parentNode as globalThis.Node;
        result = { node: parent, offset: Array.from(parent.childNodes).indexOf(n as ChildNode) };
        return true;
      }
      remaining -= 1;
      return false;
    }
    for (const child of Array.from(n.childNodes)) {
      if (walk(child)) return true;
    }
    return false;
  }
  if (!walk(container)) {
    let last: globalThis.Node | null = null;
    const findLast = (n: globalThis.Node) => {
      if (n.nodeType === Node.TEXT_NODE) last = n;
      n.childNodes.forEach(findLast);
    };
    findLast(container);
    result = last ? { node: last, offset: (last as globalThis.Node).textContent?.length ?? 0 } : { node: container, offset: container.childNodes.length };
  }
  return result as { node: globalThis.Node; offset: number };
}

function setSelectionOffsets(container: HTMLElement, start: number, end: number) {
  const selection = window.getSelection();
  if (!selection) return;
  const from = locate(container, start);
  const to = locate(container, end);
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Replaces the current selection (or inserts at the caret) with plain
 *  text — used for both paste (sanitized to `text/plain`) and Enter
 *  (inserting a literal "\n"), so line breaks and pasted content never
 *  bring in markup this editor cannot round-trip. */
function insertTextAtCaret(container: HTMLElement, text: string) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !container.contains(selection.anchorNode)) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.setEndAfter(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Same nesting `Rich` in SlideCanvas.tsx renders for the read-only view —
 *  edit and read stay visually identical, and matching the shape keeps
 *  `domToRichText` simple (it only has to look for STRONG/EM/rich-sm/lg). */
function renderRuns(value: RichText): ReactNode {
  return value.map((run, index) => {
    let content: ReactNode = run.text;
    if (run.bold) content = <strong>{content}</strong>;
    if (run.italic) content = <em>{content}</em>;
    return <span className={run.size ? `rich-${run.size}` : undefined} key={index}>{content}</span>;
  });
}

/**
 * A text block editable in place, with a Bold/Italic/Size toolbar that
 * appears when text inside it is selected.
 *
 * Typing itself is left uncontrolled — the same "commit on blur" approach
 * `InlineString` uses, for the same reason (a controlled re-render mid-edit
 * fights the caret). The toolbar is the exception: it reads the live DOM
 * fresh on every click so it never acts on a stale selection, applies the
 * mark, and restores the selection afterward so formatting five words in a
 * row doesn't require re-selecting each time.
 */
export function InlineText({
  value, onChangeMarks, label, placeholder, className, multiline = false,
}: {
  value: RichText;
  onChangeMarks: (value: RichText) => void;
  label: string;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const revertingRef = useRef(false);
  const [resetKey, setResetKey] = useState(0);
  const [selection, setSelection] = useState<{ start: number; end: number; rect: DOMRect; rich: RichText } | null>(null);

  const isEmpty = richTextLength(value) === 0;

  // Restores the caret/selection after a toolbar action re-renders this
  // block with new marks — otherwise clicking Bold would also bump the
  // cursor back to the start of the field.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const pending = pendingSelectionRef.current;
    if (!container || !pending) return;
    pendingSelectionRef.current = null;
    setSelectionOffsets(container, pending.start, pending.end);
  }, [value]);

  // `onSelect` is unreliable on plain elements (it is really an input/
  // textarea event); `selectionchange` on the document is what actually
  // fires for contentEditable, so the toolbar is tracked from there.
  useEffect(() => {
    function handleSelectionChange() {
      const container = containerRef.current;
      if (!container || document.activeElement !== container) { setSelection(null); return; }
      const offsets = getSelectionOffsets(container);
      if (!offsets) { setSelection(null); return; }
      const native = window.getSelection();
      const rect = native && native.rangeCount ? native.getRangeAt(0).getBoundingClientRect() : null;
      if (!rect || (rect.width === 0 && rect.height === 0)) { setSelection(null); return; }
      setSelection({ ...offsets, rect, rich: domToRichText(container) });
    }
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  function commit() {
    if (revertingRef.current) { revertingRef.current = false; return; }
    const container = containerRef.current;
    if (!container) return;
    const parsed = domToRichText(container);
    // Parser and DOM disagree on how much text is there — refuse to save.
    // Losing a bold mark is recoverable; silently dropping copy is not.
    if (richTextLength(parsed) !== textLength(container)) return;
    if (JSON.stringify(parsed) !== JSON.stringify(value)) onChangeMarks(parsed);
  }

  /** Re-parses the live DOM (so an in-progress, uncommitted edit is never
   *  lost), applies `update` to the current selection, and hands the
   *  result to the parent — the one path both toolbar clicks and keyboard
   *  shortcuts use. */
  function applyToSelection(update: (rich: RichText, start: number, end: number) => RichText) {
    const container = containerRef.current;
    if (!container) return;
    const offsets = getSelectionOffsets(container);
    if (!offsets) return;
    const live = domToRichText(container);
    pendingSelectionRef.current = offsets;
    onChangeMarks(update(live, offsets.start, offsets.end));
  }

  return <>
    <span
      key={resetKey}
      ref={containerRef}
      className={`direct-text-editor${className ? ` ${className}` : ""}`}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      dir="ltr"
      lang="en"
      role="textbox"
      aria-label={label}
      aria-multiline={multiline || undefined}
      data-placeholder={placeholder ?? label}
      data-empty={isEmpty ? true : undefined}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          if (multiline) insertTextAtCaret(event.currentTarget, "\n");
          else event.currentTarget.blur();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          revertingRef.current = true;
          setSelection(null);
          setResetKey((key) => key + 1); // remounts the field from `value`, discarding the live edit
          return;
        }
        const withModifier = event.metaKey || event.ctrlKey;
        if (withModifier && event.key.toLowerCase() === "b") {
          event.preventDefault();
          applyToSelection((rich, start, end) => toggleMark(rich, start, end, "bold"));
        }
        if (withModifier && event.key.toLowerCase() === "i") {
          event.preventDefault();
          applyToSelection((rich, start, end) => toggleMark(rich, start, end, "italic"));
        }
      }}
      onPaste={(event) => {
        event.preventDefault();
        const text = event.clipboardData.getData("text/plain");
        if (text) insertTextAtCaret(event.currentTarget, text);
      }}
      onBlur={commit}
    >{renderRuns(value)}</span>
    {selection && (
      <TextFormatToolbar
        rect={selection.rect}
        bold={rangeHasMark(selection.rich, selection.start, selection.end, "bold")}
        italic={rangeHasMark(selection.rich, selection.start, selection.end, "italic")}
        size={rangeSize(selection.rich, selection.start, selection.end)}
        onBold={() => applyToSelection((rich, start, end) => toggleMark(rich, start, end, "bold"))}
        onItalic={() => applyToSelection((rich, start, end) => toggleMark(rich, start, end, "italic"))}
        onSize={(size) => applyToSelection((rich, start, end) => setRangeSize(rich, start, end, size))}
      />
    )}
  </>;
}

/** Floating Bold/Italic/Size controls, positioned above (or below, if it
 *  would run off the top of the screen) the current selection. Portaled to
 *  `<body>` and placed with a measured fixed position — same technique as
 *  IconTooltip and the slide navigator's pill menu, for the same reason: a
 *  plain absolutely-positioned panel gets clipped by whichever ancestor
 *  happens to scroll or clip overflow. */
function TextFormatToolbar({
  rect, bold, italic, size, onBold, onItalic, onSize,
}: {
  rect: DOMRect;
  bold: boolean;
  italic: boolean;
  size: SizeChoice | "mixed";
  onBold: () => void;
  onItalic: () => void;
  onSize: (size: SizeChoice) => void;
}) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const bounds = toolbar.getBoundingClientRect();
    const edgeGap = 8;
    const desiredLeft = rect.left + rect.width / 2 - bounds.width / 2;
    const left = Math.min(Math.max(edgeGap, desiredLeft), Math.max(edgeGap, window.innerWidth - bounds.width - edgeGap));
    const fitsAbove = rect.top - 8 - bounds.height >= edgeGap;
    const top = fitsAbove ? rect.top - bounds.height - 8 : rect.bottom + 8;
    setPosition({ top, left });
    // Re-measured from `rect`'s own fields, not the DOMRect instance — a new
    // instance is created on every selection change even when unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect.top, rect.left, rect.width, rect.height]);

  return createPortal(
    <div
      ref={toolbarRef}
      className="rich-text-toolbar"
      role="toolbar"
      aria-label="Text formatting"
      style={{ top: position?.top ?? -10_000, left: position?.left ?? -10_000, visibility: position ? "visible" : "hidden" }}
      // mousedown fires before blur; preventing it here stops focus (and the
      // selection it would take with it) from ever leaving the text field.
      onMouseDown={(event) => event.preventDefault()}
    >
      <button type="button" aria-label="Bold" aria-pressed={bold} onClick={onBold}><strong>B</strong></button>
      <button type="button" aria-label="Italic" aria-pressed={italic} onClick={onItalic}><em>I</em></button>
      <span className="rich-text-toolbar-divider" aria-hidden="true" />
      {([["sm", "Small text", "S"], ["md", "Default text size", "M"], ["lg", "Large text", "L"]] as const).map(([option, description, glyph]) => (
        <button
          key={option} type="button"
          aria-label={description}
          aria-pressed={size === option}
          onClick={() => onSize(option)}
        >{glyph}</button>
      ))}
    </div>,
    document.body,
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
