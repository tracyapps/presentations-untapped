"use client";

/**
 * A real preview of a library block (LIBRARIES.md §11).
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
 * The preview shows the **whole block**, never a cropped window onto it. Blocks
 * are genuinely different shapes and a fixed-height crop hides exactly the part
 * you need to recognise. The card grid is masonry so variable heights pack
 * instead of leaving holes.
 *
 * Scaling is a CSS transform over a full-width render rather than shrunken font
 * sizes, so the relative type hierarchy inside the block survives.
 */
import { useEffect, useRef, useState } from "react";
import { BlockTree } from "@/components/SlideCanvas";
import type { Node } from "@/lib/slides/types";

/** Width the tree renders at before scaling. Roughly a slide's content column,
 *  so proportions match what the block looks like in a deck. */
const RENDER_WIDTH = 880;

export default function BlockPreview({
  node, theme = "light",
}: {
  node: Node;
  theme?: "light" | "dark";
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.34);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!frame || !content) return;

    function measure() {
      if (!frame || !content) return;
      const next = frame.clientWidth / RENDER_WIDTH;
      setScale(next);
      // A transform does not affect layout, so the frame has to be told how
      // tall the scaled content actually is. No cap: the whole block shows.
      setHeight(content.scrollHeight * next);
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(content);

    // Images inside the block change scrollHeight after they decode, and a
    // ResizeObserver on the wrapper does not always catch it.
    const images = [...content.querySelectorAll("img")];
    for (const image of images) image.addEventListener("load", measure);

    return () => {
      observer.disconnect();
      for (const image of images) image.removeEventListener("load", measure);
    };
  }, [node]);

  return (
    <div
      className="lib-preview"
      ref={frameRef}
      style={{ height }}
      data-theme={theme}
      /* The name, status, and tags beside this are the accessible content. A
         scaled-down visual duplicate would just be noise in a screen reader. */
      aria-hidden="true"
    >
      <div
        className="lib-preview-content"
        ref={contentRef}
        style={{ width: RENDER_WIDTH, transform: `scale(${scale})` }}
        tabIndex={-1}
      >
        <BlockTree nodes={[node]} theme={theme} />
      </div>
    </div>
  );
}
