"use client";

/**
 * A draggable divider.
 *
 * Lifted out of the slide editor so the library picker can use the same one.
 * Anywhere a person might reasonably disagree with our proportions — panel
 * widths, section heights, the split between browsing and previewing — this is
 * the answer, because the right proportion depends on their screen, not ours.
 *
 * It is a real `role="separator"` with value semantics, so it is operable by
 * keyboard (arrows nudge, Home/End go to the limits) and announces where it is.
 * Double-click restores the default, which is the escape hatch for a drag that
 * went somewhere silly.
 *
 * **`live` is not an optimisation, it is the difference between working and
 * not.** Calling `onChange` on every pointermove means a React state update per
 * mouse movement, and these dividers sit in trees where a re-render means the
 * slide canvas, the navigator, and every block preview with its ResizeObserver.
 * The browser coalesces that work and the drag stops tracking the pointer
 * entirely — press, nothing, nothing, then a jump. So during a drag we write
 * the new size straight to a CSS custom property on the element that consumes
 * it: no React, no reconciliation, just the compositor doing the one thing that
 * actually changed. React hears about it once, on release, which is also the
 * only moment worth writing to localStorage.
 */
import { useRef } from "react";
import { clamp } from "@/lib/image-geometry";

export type LiveResizeTarget = {
  /** The element carrying the custom property. Read at drag start, so it is
   *  fine for it to mount and unmount between drags. */
  getElement: () => HTMLElement | null;
  /** e.g. `--editor-resource-width`. */
  property: string;
};

export default function ResizeHandle({ orientation, className, label, value, min, max, resetValue, onChange, live }: {
  orientation: "vertical" | "horizontal";
  className: string;
  label: string;
  value: number;
  min: number;
  max: number;
  resetValue: number;
  onChange: (value: number) => void;
  live?: LiveResizeTarget;
}) {
  const handleRef = useRef<HTMLDivElement>(null);

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const startPosition = orientation === "vertical" ? event.clientX : event.clientY;
    const startValue = value;
    const element = live?.getElement() ?? null;
    let latest = startValue;

    // Capture on the handle, so the drag keeps tracking even when the pointer
    // runs off the divider — or off the window — mid-gesture.
    handleRef.current?.setPointerCapture(event.pointerId);
    document.body.classList.add("is-resizing-editor");

    function move(pointerEvent: PointerEvent) {
      const position = orientation === "vertical" ? pointerEvent.clientX : pointerEvent.clientY;
      latest = clamp(startValue + position - startPosition, min, max);
      if (element && live) element.style.setProperty(live.property, `${latest}px`);
      else onChange(latest);
    }
    function finish() {
      document.body.classList.remove("is-resizing-editor");
      // Throws if the capture was already lost (element unmounted, pointer
      // cancelled). Nothing to do about it, and nothing worth breaking for.
      try { handleRef.current?.releasePointerCapture(event.pointerId); } catch { /* already released */ }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      // Hand the final value to React once. It re-renders with the same number
      // the element is already showing, so nothing visibly moves.
      if (element && latest !== startValue) onChange(latest);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  }

  function nudge(event: React.KeyboardEvent<HTMLDivElement>) {
    const lower = orientation === "vertical" ? "ArrowLeft" : "ArrowUp";
    const higher = orientation === "vertical" ? "ArrowRight" : "ArrowDown";
    if (event.key !== lower && event.key !== higher && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    if (event.key === "Home") onChange(min);
    else if (event.key === "End") onChange(max);
    else onChange(clamp(value + (event.key === higher ? 10 : -10), min, max));
  }

  return <div
    ref={handleRef}
    className={`editor-resize-handle ${className}`}
    role="separator"
    tabIndex={0}
    aria-label={label}
    aria-orientation={orientation}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    onPointerDown={startResize}
    onKeyDown={nudge}
    onDoubleClick={() => onChange(resetValue)}
    title="Drag to resize · Double-click to reset"
  ><span aria-hidden="true" /></div>;
}
