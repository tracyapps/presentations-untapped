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

/** A filter the shell renders and applies. `options` drives a checkbox group;
 *  counts come from the caller so they can be scoped correctly. */
export type FilterDef<T> = {
  id: string;
  label: string;
  /** Single-select renders as radios (with a "Any" reset), multi as checkboxes. */
  multiple?: boolean;
  options: Array<{ value: string; label: string; count?: number; hint?: string }>;
  /** True when the item satisfies one selected value. */
  matches: (item: T, value: string) => boolean;
};

export type SortDef<T> = {
  id: string;
  label: string;
  compare: (a: T, b: T) => number;
};

export type BulkAction<T> = {
  id: string;
  label: string;
  /** Rendered in a visually distinct destructive style and always confirmed. */
  destructive?: boolean;
  /** Null when available; a sentence when not — a disabled control without a
   *  stated reason is what makes people think the app is broken. */
  disabledReason?: (items: T[]) => string | null;
  /** Return a status sentence to announce in the shell's live region. */
  run: (items: T[]) => Promise<string> | string;
  /** Confirmation body. Receives the selection so it can name the blast radius. */
  confirm?: (items: T[]) => string;
};

export type AddAction = {
  id: string;
  label: string;
  hint?: string;
  onSelect?: () => void;
  href?: string;
};

export type Selection = {
  ids: Set<string>;
  isSelected: (id: string) => boolean;
  /** `index` enables Shift+click range selection against the current order. */
  toggle: (id: string, index: number, shiftKey?: boolean) => void;
  clear: () => void;
};

export type LibraryShellProps<T extends { id: string }> = {
  title: string;
  /** Short sentence under the title. Optional; omit rather than pad. */
  description?: string;
  items: T[];
  /** Free-text haystack per item; the shell owns the search input. */
  searchText: (item: T) => string;
  views: ViewMode[];
  renderView: (mode: ViewMode, items: T[], selection: Selection) => ReactNode;
  filters?: FilterDef<T>[];
  sorts: SortDef<T>[];
  bulkActions?: BulkAction<T>[];
  addActions?: AddAction[];
  /** Persists the view-mode preference. Unique per library. */
  storageKey: string;
  emptyState: { heading: string; body: string; action?: ReactNode };
  /** Shown when filters exclude everything — distinct from a truly empty
   *  library, because the recovery action is different. */
  noResultsState?: { heading: string; body: string };
};
