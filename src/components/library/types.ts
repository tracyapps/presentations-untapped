/**
 * The shared library shell contract (LIBRARIES.md §3).
 *
 * Every library renders through `LibraryShell`. Differences between libraries
 * are supplied as slots — never as a different layout — so search, filtering,
 * selection, bulk actions, and view switching behave identically everywhere.
 */
import type { ReactNode } from "react";

export type ViewMode = "grid" | "list" | "card" | "gallery";

export const VIEW_LABELS: Record<ViewMode, string> = {
  grid: "Grid",
  list: "List",
  card: "Cards",
  gallery: "Gallery",
};

/** One filter group inside the combined filter panel. Groups stack in one
 *  popover rather than one popover each — a row of dropdowns wraps badly and
 *  makes people hunt (LIBRARIES.md §3.1). */
export type FilterDef<T> = {
  id: string;
  label: string;
  /** Single-select renders as radios, multi as checkboxes. */
  multiple?: boolean;
  options: Array<{ value: string; label: string; count?: number; hint?: string }>;
  matches: (item: T, value: string) => boolean;
};

/**
 * The one filter promoted out of the panel and onto the toolbar as a switch.
 *
 * Off by default and everything is visible — the library's job is to show you
 * what exists. Switching it on *narrows* to approved only. Framing it as a
 * subtractive switch rather than a status multi-select means the toggle only
 * ever has one effect, and there is no combination of controls that produces a
 * draft-only list someone could ship from (LIBRARIES.md §4.2).
 */
export type DraftToggleDef<T> = {
  label: string;
  hint?: string;
  /** True when the item is unapproved, and so hidden while the switch is on. */
  isDraft: (item: T) => boolean;
  draftCount: number;
};

export type SortDef<T> = {
  id: string;
  label: string;
  compare: (a: T, b: T) => number;
};

export type BulkAction<T> = {
  id: string;
  label: string;
  destructive?: boolean;
  /** Null when available; a sentence when not — a disabled control without a
   *  stated reason is what makes people think the app is broken. */
  disabledReason?: (items: T[]) => string | null;
  run: (items: T[]) => Promise<string> | string;
  confirm?: (items: T[]) => string;
};

export type AddAction = {
  id: string;
  label: string;
  hint?: string;
  onSelect?: () => void;
  href?: string;
  /** Renders visible-but-inert with the hint as the reason. Used for the v2
   *  "create directly in the library" paths, so the shape of what is coming is
   *  visible without pretending it works. */
  comingSoon?: boolean;
};

export type Selection = {
  ids: Set<string>;
  isSelected: (id: string) => boolean;
  /** `index` enables Shift+click range selection against the current order. */
  toggle: (id: string, index: number, shiftKey?: boolean) => void;
  clear: () => void;
};

/* ------------------------------ Table view ------------------------------ */

/**
 * A column in the shared table view. Sorting lives on the header here rather
 * than in the toolbar's Sort control, because in a table the header IS the
 * sort affordance and two competing controls is worse than one.
 */
export type ColumnDef<T> = {
  id: string;
  label: string;
  /** Cell contents. */
  render: (item: T) => ReactNode;
  /** Omit to make the column unsortable. */
  compare?: (a: T, b: T) => number;
  /** Structural columns (select, name) cannot be hidden. */
  required?: boolean;
  /** Hidden until the user turns it on in column settings. */
  defaultHidden?: boolean;
  width?: number;
  minWidth?: number;
  align?: "start" | "end";
  /** Marks the row header cell — exactly one column should set this. */
  isRowHeader?: boolean;
};

export type TableViewProps<T extends { id: string }> = {
  items: T[];
  columns: ColumnDef<T>[];
  selection: Selection;
  /** Persists column visibility and widths. */
  storageKey: string;
  rowLabel: (item: T) => string;
  caption: string;
};

/* ------------------------------- The shell ------------------------------ */

/**
 * Where the shell keeps search, filters and page.
 *
 * Two implementations, one contract: the URL on a library page, component state
 * inside the picker modal. Everything else about the shell is identical, which
 * is what lets the modal and the page feel like the same library.
 */
export type ParamStore = {
  params: Record<string, string>;
  set: (updates: Record<string, string | null>) => void;
  /** True while a navigation the store started is still in flight. */
  pending: boolean;
};

export type LibraryShellProps<T extends { id: string }> = {
  title: string;
  description?: string;
  items: T[];
  searchText: (item: T) => string;
  views: ViewMode[];
  renderView: (mode: ViewMode, items: T[], selection: Selection) => ReactNode;
  filters?: FilterDef<T>[];
  draftToggle?: DraftToggleDef<T>;
  sorts: SortDef<T>[];
  /** Table view drives sorting from its own headers, so the toolbar Sort
   *  control is hidden for these modes. */
  sortHiddenForViews?: ViewMode[];
  bulkActions?: BulkAction<T>[];
  addActions?: AddAction[];
  storageKey: string;
  /** Breadcrumb trail rendered above the title. The last entry is the current
   *  page and is not a link. */
  breadcrumbs?: Array<{ label: string; href?: string }>;
  /** Status message. Rendered in a fixed slot below the header rather than
   *  floated above it, so it can never overlap the breadcrumbs. */
  notice?: string;
  emptyState: { heading: string; body: string; action?: ReactNode };
  noResultsState?: { heading: string; body: string };
};

export const PAGE_SIZES = [24, 48, 96, 0] as const; // 0 = all
