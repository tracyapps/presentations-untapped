/**
 * Pure text-run math for the rich-text formatting toolbar (Bold, Italic, Size).
 *
 * A `RichText` value is a flat array of runs, each carrying its own marks.
 * Formatting a selection means: split runs at the selection's two edges so
 * the edges land on run boundaries, toggle/set the mark on every run that
 * now falls fully inside the selection, then merge back any now-identical
 * neighbours so the array does not grow without bound as someone formats
 * back and forth.
 *
 * Offsets are plain character counts into the concatenated run text — the
 * same coordinate space `Editable.tsx` computes from the live DOM selection.
 * None of this file touches the DOM; that split keeps the run-splitting
 * logic testable without a browser.
 */
import type { RichText } from "./types";

type Run = RichText[number];
export type ToggleMark = "bold" | "italic";
export type SizeChoice = "sm" | "md" | "lg";

function marksEqual(a: Run, b: Run): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.underline === b.underline
    && a.size === b.size && a.variable === b.variable;
}

/** Drops empty runs and merges adjacent runs whose marks match — keeps the
 *  array from growing every time someone formats back and forth. */
export function mergeRuns(rich: RichText): RichText {
  const out: RichText = [];
  for (const run of rich) {
    if (!run.text) continue;
    const prev = out[out.length - 1];
    if (prev && marksEqual(prev, run)) out[out.length - 1] = { ...prev, text: prev.text + run.text };
    else out.push({ ...run });
  }
  return out.length ? out : [{ text: "" }];
}

/** Splits whichever run straddles `offset` into two, so `offset` always
 *  lands on a run boundary. No-op if it already does. */
export function splitRunsAt(rich: RichText, offset: number): RichText {
  const out: RichText = [];
  let pos = 0;
  for (const run of rich) {
    const start = pos;
    const end = pos + run.text.length;
    if (offset > start && offset < end) {
      const cut = offset - start;
      out.push({ ...run, text: run.text.slice(0, cut) }, { ...run, text: run.text.slice(cut) });
    } else {
      out.push(run);
    }
    pos = end;
  }
  return out;
}

/** True only if every run inside [start, end) already carries the mark —
 *  the check that decides which way a toggle goes. */
export function rangeHasMark(rich: RichText, start: number, end: number, mark: ToggleMark): boolean {
  if (start >= end) return false;
  let pos = 0;
  let any = false;
  for (const run of rich) {
    const runStart = pos;
    const runEnd = pos + run.text.length;
    pos = runEnd;
    if (runStart >= start && runEnd <= end && run.text.length > 0) {
      any = true;
      if (!run[mark]) return false;
    }
  }
  return any;
}

/** The size shared by every run in [start, end); "mixed" if they differ,
 *  "md" (the baseline) for an empty range or runs with no size set. */
export function rangeSize(rich: RichText, start: number, end: number): SizeChoice | "mixed" {
  if (start >= end) return "md";
  let pos = 0;
  const sizes = new Set<string>();
  for (const run of rich) {
    const runStart = pos;
    const runEnd = pos + run.text.length;
    pos = runEnd;
    if (runStart >= start && runEnd <= end && run.text.length > 0) sizes.add(run.size ?? "md");
  }
  if (sizes.size === 0) return "md";
  if (sizes.size > 1) return "mixed";
  return [...sizes][0] as SizeChoice;
}

function mapRange(rich: RichText, start: number, end: number, fn: (run: Run) => Run): RichText {
  const split = splitRunsAt(splitRunsAt(rich, start), end);
  let pos = 0;
  const mapped = split.map((run) => {
    const runStart = pos;
    const runEnd = pos + run.text.length;
    pos = runEnd;
    return runStart >= start && runEnd <= end && run.text.length > 0 ? fn(run) : run;
  });
  return mergeRuns(mapped);
}

/** Toggles bold/italic across a selection. If the selection is only
 *  partially formatted, the first toggle formats all of it — the "apply on
 *  mixed selection" convention every word processor uses. */
export function toggleMark(rich: RichText, start: number, end: number, mark: ToggleMark): RichText {
  if (start === end) return rich;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const next = !rangeHasMark(rich, lo, hi, mark);
  return mapRange(rich, lo, hi, (run) => (
    mark === "bold" ? { ...run, bold: next || undefined } : { ...run, italic: next || undefined }
  ));
}

/** Sets (or clears, for "md" — the baseline) the size mark across a
 *  selection. "md" is stored as `undefined` rather than the literal string,
 *  matching how every other "back to default" control in this editor
 *  resets a field (BlockSettings' width "Auto" does the same). */
export function setRangeSize(rich: RichText, start: number, end: number, size: SizeChoice): RichText {
  if (start === end) return rich;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  return mapRange(rich, lo, hi, (run) => ({ ...run, size: size === "md" ? undefined : size }));
}

/** Total plain-text length — used as a cheap corruption guard: if a DOM
 *  parse ever disagrees with this, something upstream is wrong and the
 *  caller should refuse to save rather than risk losing a slide's copy. */
export function richTextLength(rich: RichText): number {
  return rich.reduce((sum, run) => sum + run.text.length, 0);
}
