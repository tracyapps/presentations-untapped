"use client";

/**
 * A real preview of a library block (LIBRARIES.md §4.2).
 *
 * Two rules, and they are what tell the two reusable libraries apart at a
 * glance:
 *
 *   - A **block** previews bare. No slide viewport, no 16:9 frame, no surface or
 *     pattern. It shows the content group as itself, because that is what you
 *     are choosing — a stat card, an intro paragraph, an image-and-text pair.
 *   - A **whole slide** previews as a slide, in its frame with its styling.
 *     That component is `SlidePreview` and lands with the slide library.
 *
 * Scaling is done with a CSS transform over a full-width render rather than by
 * shrinking font sizes, so relative type hierarchy inside the block survives.
 */
import { useEffect, useRef, useState } from "react";
import { BlockTree } from "@/components/SlideCanvas";
import type { Node } from "@/lib/slides/types";

/** Width the tree is rendered at before scaling. Roughly a slide's content
 *  column, so proportions match what the block looks like in a deck. */
const RENDER_WIDTH = 880;

export default function BlockPreview({
  node, theme = "light", maxHeight = 180,
}: {
  node: Node;
  theme?: "light" | "dark";
  maxHeight?: number;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const [height, setHeight] = useState(maxHeight);

  useEffect(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!frame || !content) return;

    function measure() {
      if (!frame || !content) return;
      const next = frame.clientWidth / RENDER_WIDTH;
      setScale(next);
      // Cap the frame so one very tall block cannot make a grid row enormous;
      // the overflow is clipped and faded rather than scrolled.
      setHeight(Math.min(maxHeight, Math.max(64, content.scrollHeight * next)));
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(content);
    return () => observer.disconnect();
  }, [maxHeight, node]);

  return (
    <div
      className="lib-preview"
      ref={frameRef}
      style={{ height }}
      data-theme={theme}
      /* The name, type, and summary next to this are the accessible content.
         A scaled-down visual duplicate would just be noise in a screen reader. */
      aria-hidden="true"
    >
      <div
        className="lib-preview-content"
        ref={contentRef}
        style={{ width: RENDER_WIDTH, transform: `scale(${scale})` }}
        /* inert isn't universally supported yet; this belt-and-braces stops any
           control inside a preview from taking focus. */
        tabIndex={-1}
      >
        <BlockTree nodes={[node]} theme={theme} />
      </div>
    </div>
  );
}
