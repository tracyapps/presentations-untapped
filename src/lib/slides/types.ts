/**
 * The block tree — the single data shape behind Design view, Outline view,
 * Present mode, and published decks (PLAN.md §3).
 *
 * Rules:
 *  - Renderers switch() on `type`; adding a block type = extend these unions,
 *    add one renderer per view, add a palette entry.
 *  - No color props anywhere. Color comes exclusively from theme tokens so
 *    light/dark mode always works (req #19).
 */

export type NodeId = string; // nanoid

export type SlideDoc = {
  version: 1;
  blocks: Node[];
};

export type Node = LayoutNode | ContentNode;

/* ----------------------------- Layout ----------------------------- */

export type LayoutType = "row" | "columns" | "grid" | "group";

export type LayoutNode = {
  id: NodeId;
  kind: "layout";
  type: LayoutType;
  props: {
    cols?: number;        // columns/grid
    gap?: "sm" | "md" | "lg";
    align?: "start" | "center" | "end" | "stretch";
  };
  children: Node[];
};

/* ----------------------------- Content ---------------------------- */

export type ContentType =
  | "title" | "tagline" | "blockquote" | "callout" | "paragraph"
  | "image" | "list" | "statCard" | "table" | "pricingTable" | "chart";

/** Inline rich text: minimal marks only (req #19 — no color marks). */
export type RichText = Array<{
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  size?: "sm" | "md" | "lg"; // relative step, resolved by each block's own scale
}>;

export type ContentProps = {
  title:      { text: RichText };
  tagline:    { text: RichText };
  blockquote: { text: RichText; attribution?: string };
  callout:    { text: RichText; variant: "accent" | "teal" | "blue" };
  paragraph:  { text: RichText };
  image:      { src: string; alt: string; decorative?: boolean }; // alt required unless decorative
  list:       { ordered: boolean; items: RichText[] };
  statCard:   { value: string; label: string; caption?: string };
  table:      { header: string[]; rows: string[][] };
  pricingTable: {
    columns: Array<{ name: string; price: string; features: string[]; highlighted?: boolean }>;
  };
  chart:      { chartType: "bar" | "line" | "pie"; labels: string[]; series: number[] };
};

export type ContentNode = {
  [T in ContentType]: {
    id: NodeId;
    kind: "content";
    type: T;
    props: ContentProps[T];
  };
}[ContentType];

/* ---------------------------- Captions ---------------------------- */

export type CaptionCue = {
  start: number; // seconds
  end: number;
  text: string;
};

/* ---------------------------- Helpers ------------------------------ */

export function isLayout(n: Node): n is LayoutNode {
  return n.kind === "layout";
}

/** Depth-first walk (used by outline view, library save, block lookups). */
export function walk(nodes: Node[], fn: (n: Node, parent: LayoutNode | null) => void, parent: LayoutNode | null = null): void {
  for (const n of nodes) {
    fn(n, parent);
    if (isLayout(n)) walk(n.children, fn, n);
  }
}

export function findNode(doc: SlideDoc, id: NodeId): Node | null {
  let found: Node | null = null;
  walk(doc.blocks, (n) => { if (n.id === id) found = n; });
  return found;
}
