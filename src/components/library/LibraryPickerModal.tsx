"use client";

/**
 * The one place you go to find something to put on a slide.
 *
 * Why a modal and not a page: picking a block is an errand inside the job of
 * editing a slide, not a departure from it. A route change throws away scroll
 * position, unsaved-change confidence, and the sense that you are coming
 * straight back. The media library already worked this way; the block library
 * sending people to `/library` was the odd one out, and the two libraries not
 * behaving alike was the actual complaint.
 *
 * Shape, in the order you meet it:
 *
 *   tabs → you landed on Slides but meant Blocks; switch without going back
 *   search / filter / sort / approved-only → identical to the library page,
 *     because it *is* the library page's shell (LibraryPickerShell)
 *   preview pane → what you have selected, in the version you selected
 *   Add → it lands on the slide and the modal gets out of the way
 *
 * Selection here is single and transient — the thing you are about to add. It
 * deliberately does not reuse the shell's multi-select, which exists for bulk
 * tagging and deleting and would mean something different in the same pixels.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MediaLibraryPanel from "@/components/MediaLibraryPanel";
import ResizeHandle from "@/components/ResizeHandle";
import BlockPreview from "./BlockPreview";
import StatusPill from "./StatusPill";
import { LibraryPickerShell } from "./LibraryShell";
import {
  BLOCK_STATUS_LABELS, blockDraftToggle, blockFilters, blockSearchText, blockSorts,
  nodeSummary, type TaxonomyOption,
} from "./block-catalog";
import { useFocusTrap } from "@/lib/focus-trap";
import type { LibraryBlockItem } from "@/lib/data/library";
import type { MediaAsset } from "@/lib/data/media";

export type PickerTab = "blocks" | "media" | "slides";

const TABS: Array<{ id: PickerTab; label: string; ready: boolean }> = [
  { id: "blocks", label: "Content blocks", ready: true },
  { id: "media", label: "Media", ready: true },
  // Visible and inert rather than absent: people only look for a slide library
  // if they can see that one is coming (LIBRARIES.md §4.3).
  { id: "slides", label: "Slides", ready: false },
];

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago",
});

/**
 * The finding column is the *narrow* one.
 *
 * The whole reason for a preview pane is to see the thing at a size where you
 * can actually tell whether it is the right one — a preview squeezed into the
 * smaller half is just a bigger thumbnail. So results get enough width to scan
 * and the preview gets the rest.
 *
 * "The rest" is not ours to decide though: how much preview you need depends on
 * the screen you are on, not on the design. Hence the divider, remembered per
 * person. Wide enough that the results grid keeps at least two columns; narrow
 * enough that the preview always has room to be a preview.
 */
const RESULTS_WIDTH_KEY = "lu-picker-results-width-v1";
const RESULTS_WIDTH_LIMITS = [260, 720] as const;
const DEFAULT_RESULTS_WIDTH = 380;

function readableSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type LibraryPickerModalProps = {
  open: boolean;
  tab: PickerTab;
  onTabChange: (tab: PickerTab) => void;
  onClose: () => void;

  blocks: LibraryBlockItem[];
  categories: TaxonomyOption[];
  tagOptions: TaxonomyOption[];
  /** Preselects a block — the sidebar's Preview action lands here. */
  initialBlockId?: string | null;
  onAddBlock: (item: LibraryBlockItem) => void;

  media: MediaAsset[];
  mediaConfigured: boolean;
  mediaLoadError?: string;
  /** Preselects an asset — clicking a sidebar thumbnail lands here. */
  initialAssetUrl?: string | null;
  onMediaUploaded: (asset: MediaAsset) => void;
  onMediaDelete: (asset: MediaAsset) => Promise<boolean>;
  onAddMedia: (asset: MediaAsset) => void;
  onUseMediaAsBackground: (asset: MediaAsset) => void;
};

export default function LibraryPickerModal({
  open, tab, onTabChange, onClose,
  blocks, categories, tagOptions, initialBlockId, onAddBlock,
  media, mediaConfigured, mediaLoadError, initialAssetUrl,
  onMediaUploaded, onMediaDelete, onAddMedia, onUseMediaAsBackground,
}: LibraryPickerModalProps) {
  const [blockId, setBlockId] = useState<string | null>(initialBlockId ?? null);
  const [assetUrl, setAssetUrl] = useState<string | null>(initialAssetUrl ?? null);
  const [resultsWidth, setResultsWidth] = useState(DEFAULT_RESULTS_WIDTH);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const tabRefs = useRef(new Map<PickerTab, HTMLButtonElement | null>());
  useFocusTrap(dialogRef, open);

  // Reseed on each open, not on every render: while the modal is up, what you
  // have selected is yours to change.
  useEffect(() => {
    if (!open) return;
    setBlockId(initialBlockId ?? null);
    setAssetUrl(initialAssetUrl ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(RESULTS_WIDTH_KEY));
      if (Number.isFinite(stored) && stored > 0) {
        setResultsWidth(Math.min(RESULTS_WIDTH_LIMITS[1], Math.max(RESULTS_WIDTH_LIMITS[0], stored)));
      }
    } catch { /* private mode — the default is a fine outcome */ }
  }, []);

  const changeResultsWidth = useCallback((width: number) => {
    setResultsWidth(width);
    try { window.localStorage.setItem(RESULTS_WIDTH_KEY, String(width)); } catch { /* see above */ }
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [open, onClose]);

  const selectedBlock = useMemo(
    () => blocks.find((item) => item.id === blockId) ?? null,
    [blocks, blockId],
  );
  const selectedAsset = useMemo(
    () => media.find((item) => item.url === assetUrl) ?? null,
    [media, assetUrl],
  );

  const filters = useMemo(() => blockFilters(blocks, categories, tagOptions), [blocks, categories, tagOptions]);
  const draftToggle = useMemo(() => blockDraftToggle(blocks), [blocks]);

  /** Enter/click selects; a second activation adds. Double-click does both, so
   *  the confident path is one gesture and the careful path is still two. */
  const addSelected = useCallback(() => {
    if (tab === "blocks" && selectedBlock) { onAddBlock(selectedBlock); onClose(); }
    if (tab === "media" && selectedAsset) { onAddMedia(selectedAsset); onClose(); }
  }, [tab, selectedBlock, selectedAsset, onAddBlock, onAddMedia, onClose]);

  if (!open) return null;

  function moveTab(step: number) {
    const index = TABS.findIndex((entry) => entry.id === tab);
    const next = TABS[(index + step + TABS.length) % TABS.length];
    onTabChange(next.id);
    // Focus follows selection in an automatic-activation tablist.
    requestAnimationFrame(() => tabRefs.current.get(next.id)?.focus());
  }

  const canAdd = tab === "blocks" ? Boolean(selectedBlock) : tab === "media" ? Boolean(selectedAsset) : false;

  return (
    <div className="picker-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="picker-modal" role="dialog" aria-modal="true" aria-labelledby="picker-modal-title">
        <header className="picker-modal-header">
          <div>
            <p className="eyebrow">Add to this slide</p>
            <h2 id="picker-modal-title">Library</h2>
          </div>

          <div className="picker-tabs" role="tablist" aria-label="Libraries">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                ref={(node) => { tabRefs.current.set(entry.id, node); }}
                type="button" role="tab"
                id={`picker-tab-${entry.id}`}
                aria-controls={`picker-panel-${entry.id}`}
                aria-selected={tab === entry.id}
                tabIndex={tab === entry.id ? 0 : -1}
                className={tab === entry.id ? "is-active" : undefined}
                onClick={() => onTabChange(entry.id)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight") { event.preventDefault(); moveTab(1); }
                  if (event.key === "ArrowLeft") { event.preventDefault(); moveTab(-1); }
                }}
              >
                {entry.label}
                {!entry.ready && <small>Soon</small>}
              </button>
            ))}
          </div>

          <button ref={closeRef} type="button" className="picker-modal-close" aria-label="Close library" onClick={onClose}>×</button>
        </header>

        <div
          className="picker-modal-body"
          style={{ "--picker-results-width": `${resultsWidth}px` } as React.CSSProperties}
        >
          <div
            className="picker-modal-results"
            role="tabpanel"
            id={`picker-panel-${tab}`}
            aria-labelledby={`picker-tab-${tab}`}
            /* This is the scrolling region, so it has to be reachable by
               keyboard — a scroll container you can only reach with a mouse is
               content some people simply cannot read. */
            tabIndex={0}
          >
            {tab === "blocks" && (
              <LibraryPickerShell<LibraryBlockItem>
                title="Content blocks"
                items={blocks}
                storageKey="blocks"
                searchText={blockSearchText}
                views={["grid", "list"]}
                filters={filters}
                draftToggle={draftToggle}
                sorts={blockSorts}
                sortHiddenForViews={[]}
                emptyState={{
                  heading: "Nothing saved yet",
                  body: "Use the bookmark button on any block while editing a slide to save a reusable copy. It shows up here straight away.",
                }}
                noResultsState={{
                  heading: "No blocks match those filters",
                  body: "Try a different search or clear the filters. If “Approved only” is on, switching it off will show drafts too.",
                }}
                renderView={(mode, visible) => (
                  <div className={mode === "grid" ? "picker-block-grid" : "picker-block-rows"}>
                    {visible.map((item) => (
                      <BlockChoice
                        key={item.id}
                        item={item}
                        mode={mode === "grid" ? "grid" : "row"}
                        selected={item.id === blockId}
                        onSelect={() => setBlockId(item.id)}
                        onCommit={() => { onAddBlock(item); onClose(); }}
                      />
                    ))}
                  </div>
                )}
              />
            )}

            {tab === "media" && (
              <MediaLibraryPanel
                variant="modal"
                items={media}
                configured={mediaConfigured}
                loadError={mediaLoadError}
                selectedUrl={assetUrl ?? undefined}
                onUploaded={onMediaUploaded}
                onSelect={(asset) => setAssetUrl(asset.url)}
                onDelete={async (asset) => {
                  const deleted = await onMediaDelete(asset);
                  if (deleted) setAssetUrl((current) => (current === asset.url ? null : current));
                  return deleted;
                }}
              />
            )}

            {tab === "slides" && (
              <div className="empty-state">
                <p className="eyebrow">Coming in v2</p>
                <h2>Reusable slides</h2>
                <p>
                  Whole slides — layout, styling and content together — will be saved and
                  reused from here, with the same search, filters and preview you are
                  looking at now. Today, save the pieces as content blocks.
                </p>
                <button type="button" className="button button-secondary" onClick={() => onTabChange("blocks")}>
                  Go to content blocks
                </button>
              </div>
            )}
          </div>

          <ResizeHandle
            orientation="vertical"
            className="picker-resize-handle"
            label="Resize the results column"
            value={resultsWidth}
            min={RESULTS_WIDTH_LIMITS[0]}
            max={RESULTS_WIDTH_LIMITS[1]}
            resetValue={DEFAULT_RESULTS_WIDTH}
            onChange={changeResultsWidth}
          />

          <aside className="picker-modal-preview" aria-label="Preview">
            {tab === "blocks" && (selectedBlock ? (
              <BlockPreviewPane item={selectedBlock} />
            ) : (
              <p className="picker-preview-empty">Select a block to preview it here.</p>
            ))}

            {tab === "media" && (selectedAsset ? (
              <div className="picker-preview-body">
                <div className="picker-preview-stage">
                  {/* Blob URLs are dynamic and intentionally unoptimized here. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selectedAsset.url} alt="" />
                </div>
                <h3>{selectedAsset.name}</h3>
                <dl className="picker-preview-meta">
                  <div><dt>Size</dt><dd>{readableSize(selectedAsset.size)}</dd></div>
                  <div><dt>Uploaded</dt><dd>{dateFormatter.format(new Date(selectedAsset.uploadedAt))}</dd></div>
                </dl>
              </div>
            ) : (
              <p className="picker-preview-empty">Select an image to preview it here.</p>
            ))}

            {tab === "slides" && <p className="picker-preview-empty">Slide previews arrive with the slide library.</p>}
          </aside>
        </div>

        <footer className="picker-modal-footer">
          <span>
            {tab === "slides" ? "Not available yet."
              : canAdd ? "Adds to the slide you are editing."
              : "Choose something to add."}
          </span>
          <div>
            <button className="button button-secondary" type="button" onClick={onClose}>Cancel</button>
            {tab === "media" && (
              <button
                className="button button-secondary" type="button"
                disabled={!selectedAsset}
                onClick={() => { if (selectedAsset) { onUseMediaAsBackground(selectedAsset); onClose(); } }}
              >
                Use as background
              </button>
            )}
            <button className="button button-primary" type="button" disabled={!canAdd} onClick={addSelected}>
              Add to slide
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

/**
 * One choosable block.
 *
 * The whole card is the target — in a picker there is exactly one thing you can
 * do to a card, so a small button inside it would be a needlessly small target
 * for a needlessly precise gesture. It gets there with an overlay button rather
 * than by wrapping the card in one: a `<button>` may only contain phrasing
 * content, and a real block preview is headings, lists and tables. So the
 * visible content stays outside the control and the control carries its own
 * accessible name.
 */
function BlockChoice({ item, mode, selected, onSelect, onCommit }: {
  item: LibraryBlockItem;
  mode: "grid" | "row";
  selected: boolean;
  onSelect: () => void;
  onCommit: () => void;
}) {
  const summary = nodeSummary(item.node);
  return (
    <article
      className={`picker-block picker-block-${mode}`}
      data-status={item.status}
      data-selected={selected || undefined}
    >
      {mode === "grid" && (
        <div className="picker-block-preview">
          <BlockPreview node={item.node} />
        </div>
      )}
      <div className="picker-block-text">
        <strong>{item.name}</strong>
        <span className="picker-block-gist">{summary}</span>
        <span className="picker-block-meta">
          <StatusPill status={item.status} />
          {item.category && <span className="lib-tag is-category">{item.category.name}</span>}
          <span className="picker-block-version">v{item.version}</span>
        </span>
      </div>
      <button
        type="button" className="picker-block-hit"
        aria-pressed={selected}
        onClick={onSelect}
        onDoubleClick={onCommit}
      >
        <span className="sr-only">
          {item.name}. {summary}. {BLOCK_STATUS_LABELS[item.status]}, version {item.version}.
          {selected ? " Selected." : ""}
        </span>
      </button>
    </article>
  );
}

/** The confirm step: what you picked, in the version you picked, before it
 *  lands on the slide. */
function BlockPreviewPane({ item }: { item: LibraryBlockItem }) {
  return (
    <div className="picker-preview-body">
      <div className="picker-preview-stage">
        <BlockPreview node={item.node} />
      </div>
      <h3>{item.name}</h3>
      {item.description && <p className="picker-preview-description">{item.description}</p>}

      {/* Versions are v2 (LIBRARIES.md §8). Shown as a real, disabled control
          with the reason attached rather than hidden, because the whole point
          of the preview pane is "check you are adding the right one" — people
          need to see that choosing between versions is where this is going. */}
      <label className="picker-version">
        <span>Version</span>
        <select value={item.version} disabled aria-describedby="picker-version-why">
          <option value={item.version}>v{item.version} · current</option>
        </select>
      </label>
      <p id="picker-version-why" className="picker-version-why">
        Named versions arrive in v2. Every block has one current version today.
      </p>

      <dl className="picker-preview-meta">
        <div><dt>Status</dt><dd><StatusPill status={item.status} /></dd></div>
        <div>
          <dt>Used in</dt>
          <dd>{item.usageCount ? `${item.usageCount} ${item.usageCount === 1 ? "deck" : "decks"}` : "No decks yet"}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd><time dateTime={item.updatedAt}>{dateFormatter.format(new Date(item.updatedAt))}</time></dd>
        </div>
        {item.tags.length > 0 && (
          <div>
            <dt>Tags</dt>
            <dd>{item.tags.map((tag) => tag.name).join(", ")}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
