/**
 * What "a content block library" means, in one place.
 *
 * The filters, sorts, and search haystack live here rather than inside
 * `BlockLibrary` because the same library is now rendered in two places — the
 * `/library/blocks` page and the editor's picker modal — and the promise made to
 * the user is that those are the *same library*, not two views that happen to
 * resemble each other. Sharing the definitions is how that stays true when
 * someone adds a filter six months from now.
 */
import type { FilterDef, SortDef } from "./types";
import type { LibraryBlockItem } from "@/lib/data/library";
import type { Node, RichText } from "@/lib/slides/types";
import { isLayout } from "@/lib/slides/types";

export type TaxonomyOption = { id: string; name: string; count: number };

/**
 * Filter options for a set of blocks.
 *
 * Counts come from the items actually being shown rather than from the tag
 * table, so a filter never offers an option that returns nothing. Shared by the
 * library page and the editor so the two never disagree about which categories
 * exist.
 */
export function blockTaxonomyOptions(
  items: LibraryBlockItem[],
  allTags: Array<{ id: string; name: string; kind: string }>,
): { categories: TaxonomyOption[]; tagOptions: TaxonomyOption[] } {
  const used = (id: string) => items.filter((item) =>
    item.category?.id === id || item.tags.some((tag) => tag.id === id)).length;

  const build = (kind: string) => allTags
    .filter((tag) => tag.kind === kind)
    .map((tag) => ({ id: tag.id, name: tag.name, count: used(tag.id) }))
    .filter((tag) => tag.count > 0);

  return { categories: build("category"), tagOptions: build("tag") };
}

function text(value: RichText): string {
  return value.map((part) => part.text).join("");
}

/** A readable one-line gist of any block — the search haystack, the list view's
 *  secondary line, and the sidebar row's subtitle. The grid uses a real render
 *  instead. */
export function nodeSummary(node: Node): string {
  if (isLayout(node)) {
    const inner = node.children.map(nodeSummary).filter(Boolean).join(" · ");
    return inner || `${node.type} layout`;
  }
  switch (node.type) {
    case "title": case "tagline": case "blockquote":
    case "callout": case "paragraph": return text(node.props.text) || node.type;
    case "statCard": return `${node.props.value} · ${node.props.label}`;
    case "image": return node.props.alt || "Image";
    case "list": return node.props.items.map(text).join(" · ");
    case "process": return node.props.steps.map((step) => step.title).join(" → ");
    case "table": return node.props.header.join(" · ");
    case "pricingTable": return node.props.columns.map((column) => column.name).join(" · ");
    case "chart": return `${node.props.chartType} chart · ${node.props.labels.join(", ")}`;
  }
}

export function blockSearchText(item: LibraryBlockItem): string {
  return [
    item.name, item.description ?? "", nodeSummary(item.node),
    item.category?.name ?? "", item.tags.map((tag) => tag.name).join(" "),
    item.author?.name ?? "",
  ].join(" ");
}

/**
 * Status is deliberately absent: it is promoted to the drafts switch in the
 * toolbar. Block type is gone too — it cannot describe a nested group, and what
 * people are hunting for is the content, not the shape.
 */
export function blockFilters(
  items: LibraryBlockItem[],
  categories: TaxonomyOption[],
  tagOptions: TaxonomyOption[],
): FilterDef<LibraryBlockItem>[] {
  return [
    {
      id: "category", label: "Category", multiple: true,
      options: categories.map((c) => ({ value: c.id, label: c.name, count: c.count })),
      matches: (item, value) => item.category?.id === value,
    },
    {
      id: "tag", label: "Tags", multiple: true,
      options: tagOptions.map((t) => ({ value: t.id, label: t.name, count: t.count })),
      matches: (item, value) => item.tags.some((tag) => tag.id === value),
    },
    {
      id: "flag", label: "Show only", multiple: true,
      options: [
        { value: "favorites", label: "My favorites", count: items.filter((i) => i.favorited).length },
        { value: "untagged", label: "Needs tagging", hint: "No category or tags", count: items.filter((i) => !i.category && !i.tags.length).length },
        { value: "unused", label: "Not used in any deck", count: items.filter((i) => i.usageCount === 0).length },
      ],
      matches: (item, value) => {
        if (value === "favorites") return item.favorited;
        if (value === "untagged") return !item.category && item.tags.length === 0;
        return item.usageCount === 0;
      },
    },
  ];
}

export const blockSorts: SortDef<LibraryBlockItem>[] = [
  { id: "updated", label: "Recently updated", compare: (a, b) => b.updatedAt.localeCompare(a.updatedAt) },
  { id: "created", label: "Recently added", compare: (a, b) => b.createdAt.localeCompare(a.createdAt) },
  { id: "name", label: "Name (A–Z)", compare: (a, b) => a.name.localeCompare(b.name) },
  { id: "used", label: "Most used", compare: (a, b) => b.usageCount - a.usageCount },
];

export const BLOCK_STATUS_LABELS = {
  draft: "Draft", in_review: "In review", approved: "Approved",
} as const;

export const BLOCK_STATUS_GLYPHS = {
  draft: "◌", in_review: "◐", approved: "✓",
} as const;

/** The drafts switch, defined once so the page and the picker hide the same
 *  things when it is on. */
export function blockDraftToggle(items: LibraryBlockItem[]) {
  return {
    label: "Approved only",
    isDraft: (item: LibraryBlockItem) => item.status !== "approved",
    draftCount: items.filter((item) => item.status !== "approved").length,
  };
}
