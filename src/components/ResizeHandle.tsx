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
 */
import { clamp } from "@/lib/image-geometry";

export default function ResizeHandle({ orientation, className, label, value, min, max, resetValue, onChange }: {
  orientation: "vertical" | "horizontal";
  className: string;
  label: string;
  value: number;
  min: number;
  max: number;
  resetValue: number;
  onChange: (value: number) => void;
}) {
  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const startPosition = orientation === "vertical" ? event.clientX : event.clientY;
    const startValue = value;
    document.body.classList.add("is-resizing-editor");
    function move(pointerEvent: PointerEvent) {
      const position = orientation === "vertical" ? pointerEvent.clientX : pointerEvent.clientY;
      onChange(clamp(startValue + position - startPosition, min, max));
    }
    function finish() {
      document.body.classList.remove("is-resizing-editor");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
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
