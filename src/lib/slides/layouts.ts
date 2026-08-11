/**
 * Slide layout templates (req #17) — named skeletons à la PowerPoint/Keynote.
 * Each produces a starter block tree; `preview` is a lines-and-boxes SVG
 * for the visual layout dropdown.
 *
 * Layout CHANGES must run through migrateToLayout() so any content that
 * won't fit is surfaced in a confirmation dialog before being dropped —
 * never silently (PLAN §8.7).
 */
import { nanoid } from "nanoid";
import type { SlideDoc, Node, ContentNode, RichText } from "./types";
import { isLayout, walk } from "./types";

const t = (text: string): RichText => [{ text }];

function content<T extends ContentNode["type"]>(type: T, props: Extract<ContentNode, { type: T }>["props"]): Node {
  return { id: nanoid(8), kind: "content", type, props } as Node;
}
function row(children: Node[]): Node {
  return { id: nanoid(8), kind: "layout", type: "row", props: {}, children };
}
function columns(cols: number, children: Node[]): Node {
  return { id: nanoid(8), kind: "layout", type: "columns", props: { cols }, children };
}

export type LayoutDef = {
  key: string;
  name: string;
  build: () => SlideDoc;
  /** simplified lines-and-boxes preview, 160×90 viewBox */
  preview: string;
};

export const LAYOUTS: LayoutDef[] = [
  {
    key: "title-only",
    name: "Title",
    build: () => ({ version: 1, blocks: [content("title", { text: t("Slide title") })] }),
    preview: `<svg viewBox="0 0 160 90"><rect x="20" y="38" width="120" height="14" rx="2"/></svg>`,
  },
  {
    key: "title-paragraph",
    name: "Title & Paragraph",
    build: () => ({
      version: 1,
      blocks: [
        content("title", { text: t("Slide title") }),
        content("paragraph", { text: t("Say the thing.") }),
      ],
    }),
    preview: `<svg viewBox="0 0 160 90"><rect x="16" y="14" width="90" height="10" rx="2"/><rect x="16" y="34" width="128" height="4" rx="1"/><rect x="16" y="42" width="128" height="4" rx="1"/><rect x="16" y="50" width="96" height="4" rx="1"/></svg>`,
  },
  {
    key: "two-column",
    name: "Two Columns",
    build: () => ({
      version: 1,
      blocks: [
        content("title", { text: t("Slide title") }),
        columns(2, [
          content("paragraph", { text: t("Left column") }),
          content("paragraph", { text: t("Right column") }),
        ]),
      ],
    }),
    preview: `<svg viewBox="0 0 160 90"><rect x="16" y="12" width="90" height="9" rx="2"/><rect x="16" y="30" width="60" height="44" rx="2"/><rect x="84" y="30" width="60" height="44" rx="2"/></svg>`,
  },
  {
    key: "stat-row",
    name: "Stat Row",
    build: () => ({
      version: 1,
      blocks: [
        content("title", { text: t("The numbers") }),
        row([
          content("statCard", { value: "0%", label: "stat one" }),
          content("statCard", { value: "0%", label: "stat two" }),
          content("statCard", { value: "0%", label: "stat three" }),
        ]),
      ],
    }),
    preview: `<svg viewBox="0 0 160 90"><rect x="16" y="12" width="90" height="9" rx="2"/><rect x="16" y="32" width="38" height="40" rx="3"/><rect x="61" y="32" width="38" height="40" rx="3"/><rect x="106" y="32" width="38" height="40" rx="3"/></svg>`,
  },
  {
    key: "horizontal-timeline",
    name: "Horizontal Timeline",
    build: () => ({
      version: 1,
      blocks: [
        content("title", { text: t("How it unfolds") }),
        content("process", { direction: "horizontal", steps: [
          { title: "First milestone", detail: "Set the starting point" },
          { title: "Next milestone", detail: "Build momentum" },
          { title: "Outcome", detail: "Show the change" },
        ] }),
      ],
    }),
    preview: `<svg viewBox="0 0 160 90"><rect x="16" y="12" width="90" height="9" rx="2"/><path d="M28 51h104" stroke="currentColor" stroke-width="2"/><circle cx="28" cy="51" r="6"/><circle cx="80" cy="51" r="6"/><circle cx="132" cy="51" r="6"/></svg>`,
  },
  {
    key: "vertical-process",
    name: "Vertical Process",
    build: () => ({
      version: 1,
      blocks: [
        content("title", { text: t("The process") }),
        content("process", { direction: "vertical", steps: [
          { title: "Start", detail: "Activate the opportunity" },
          { title: "Build", detail: "Bring people into the experience" },
          { title: "Repeat", detail: "Turn participation into a habit" },
        ] }),
      ],
    }),
    preview: `<svg viewBox="0 0 160 90"><rect x="16" y="10" width="90" height="8" rx="2"/><rect x="28" y="27" width="104" height="13" rx="3"/><path d="M80 40v6" stroke="currentColor" stroke-width="2"/><rect x="28" y="46" width="104" height="13" rx="3"/><path d="M80 59v6" stroke="currentColor" stroke-width="2"/><rect x="28" y="65" width="104" height="13" rx="3"/></svg>`,
  },
  {
    key: "quote",
    name: "Quote",
    build: () => ({
      version: 1,
      blocks: [content("blockquote", { text: t("Something a happy client said."), attribution: "Who said it" })],
    }),
    preview: `<svg viewBox="0 0 160 90"><rect x="28" y="28" width="104" height="6" rx="1"/><rect x="28" y="40" width="104" height="6" rx="1"/><rect x="52" y="56" width="56" height="4" rx="1"/></svg>`,
  },
  {
    key: "image-left",
    name: "Image & Text",
    build: () => ({
      version: 1,
      blocks: [
        columns(2, [
          content("image", { src: "", alt: "" }),
          row([
            content("title", { text: t("Slide title") }),
            content("paragraph", { text: t("Supporting copy.") }),
          ]),
        ]),
      ],
    }),
    preview: `<svg viewBox="0 0 160 90"><rect x="14" y="16" width="62" height="58" rx="3"/><rect x="86" y="22" width="58" height="9" rx="2"/><rect x="86" y="40" width="58" height="4" rx="1"/><rect x="86" y="48" width="58" height="4" rx="1"/></svg>`,
  },
];

export const layoutByKey = (key: string) => LAYOUTS.find((l) => l.key === key);

export type LayoutMigration = {
  doc: SlideDoc;
  /** Content that had no slot in the new layout. If non-empty the UI MUST
   *  show a confirmation dialog listing these before applying (req #17). */
  dropped: ContentNode[];
};

/** Re-pour existing content into a new layout's skeleton, slot-matching by
 *  type first, then by order. Anything left over is reported, not discarded
 *  silently — the caller shows the confirm dialog. */
export function migrateToLayout(current: SlideDoc, targetKey: string): LayoutMigration {
  const target = layoutByKey(targetKey);
  if (!target) return { doc: current, dropped: [] };

  const pool: ContentNode[] = [];
  walk(current.blocks, (n) => { if (!isLayout(n)) pool.push(n as ContentNode); });

  const doc = target.build();
  doc.style = current.style;
  walk(doc.blocks, (n, parent) => {
    if (isLayout(n)) return;
    const slot = n as ContentNode;
    const matchIdx = pool.findIndex((c) => c.type === slot.type);
    if (matchIdx !== -1) {
      const [match] = pool.splice(matchIdx, 1);
      const host = parent ? parent.children : doc.blocks;
      const i = host.indexOf(n);
      if (i !== -1) host[i] = match;
    }
  });

  return { doc, dropped: pool };
}
