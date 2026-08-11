"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BlockDropZone, isActiveTarget, type BlockDndController, type BlockDropTarget, useBlockDnd } from "@/components/BlockDnd";
import {
  addSlideAction, deleteSlideAction, duplicateSlideAction, saveBlockToLibraryAction,
  saveSlideAction, type SaveSlideResult,
} from "@/app/decks/[id]/edit/actions";
import SlideCanvas from "@/components/SlideCanvas";
import MediaLibraryPanel from "@/components/MediaLibraryPanel";
import MediaLibraryModal from "@/components/MediaLibraryModal";
import VoiceoverEditor from "@/components/VoiceoverEditor";
import type { EditorDeck, EditorSlide } from "@/lib/data/editor";
import type { LibraryBlockItem } from "@/lib/data/library";
import type { MediaAsset, MediaLibraryData } from "@/lib/data/media";
import { hasMediaDrag, readMediaDrag } from "@/lib/media-dnd";
import { LAYOUTS, migrateToLayout } from "@/lib/slides/layouts";
import { appendContent, appendLayout, cloneNode, createContentNode, deleteNode, duplicateNode, moveNode, moveNodeTo, swapLayoutChildren } from "@/lib/slides/editor";
import { PATTERNS, SURFACES, type SlidePatternChoice, type SurfaceChoice } from "@/lib/slides/styles";
import type { ContentNode, ContentProps, ContentType, LayoutNode, LayoutType, Node, RichText } from "@/lib/slides/types";
import { findNode, isLayout } from "@/lib/slides/types";

type Tab = "design" | "outline" | "voiceover";
type SaveState = "saved" | "dirty" | "saving" | "conflict" | "error";
type PaletteSection = "layouts" | "design" | "content" | "library" | "media";
type TextNode = Extract<ContentNode, { type: "title" | "tagline" | "blockquote" | "callout" | "paragraph" }>;

const PALETTE_STATE_KEY = "lu-editor-palette-sections-v1";
const DEFAULT_PALETTE_STATE: Record<PaletteSection, boolean> = {
  layouts: true,
  design: true,
  content: true,
  library: true,
  media: true,
};

const CONTENT_PALETTE: Array<{ type: ContentType; label: string }> = [
  { type: "title", label: "Title" }, { type: "tagline", label: "Tagline" },
  { type: "paragraph", label: "Paragraph" }, { type: "blockquote", label: "Quote" },
  { type: "callout", label: "Callout" }, { type: "image", label: "Image" },
  { type: "list", label: "List" }, { type: "process", label: "Process" },
  { type: "statCard", label: "Stat card" },
  { type: "table", label: "Table" }, { type: "pricingTable", label: "Pricing" },
  { type: "chart", label: "Chart" },
];

const STRUCTURE_PALETTE: Array<{ type: LayoutType; label: string }> = [
  { type: "row", label: "Row" },
  { type: "columns", label: "Columns" },
  { type: "group", label: "Group" },
];

function isTextNode(node: ContentNode): node is TextNode {
  return ["title", "tagline", "blockquote", "callout", "paragraph"].includes(node.type);
}

function replaceNode(nodes: Node[], id: string, update: (node: ContentNode) => ContentNode): Node[] {
  return nodes.map((node) => {
    if (node.id === id && !isLayout(node)) return update(node);
    if (isLayout(node)) return { ...node, children: replaceNode(node.children, id, update) };
    return node;
  });
}

function plainText(value: RichText): string {
  return value.map((part) => part.text).join("");
}

export default function SlideEditor({ deck, initialSlide, libraryItems, mediaLibrary }: { deck: EditorDeck; initialSlide: EditorSlide; libraryItems: LibraryBlockItem[]; mediaLibrary: MediaLibraryData }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("design");
  const [previewTheme, setPreviewTheme] = useState<"light" | "dark">(deck.themeDefault);
  const [paletteState, setPaletteState] = useState(DEFAULT_PALETTE_STATE);
  const [availableLibraryItems, setAvailableLibraryItems] = useState(libraryItems);
  const [mediaItems, setMediaItems] = useState(mediaLibrary.items);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [doc, setDoc] = useState(initialSlide.blocks);
  const [savedDoc, setSavedDoc] = useState(initialSlide.blocks);
  const [layoutKey, setLayoutKey] = useState(initialSlide.layoutKey);
  const [savedLayoutKey, setSavedLayoutKey] = useState(initialSlide.layoutKey);
  const [updatedAt, setUpdatedAt] = useState(initialSlide.updatedAt);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [message, setMessage] = useState("");
  const [libraryNotice, setLibraryNotice] = useState("");
  const [libraryTarget, setLibraryTarget] = useState<Node | null>(null);
  const [libraryName, setLibraryName] = useState("");
  const [mediaTargetId, setMediaTargetId] = useState<string | null>(null);
  const [voiceoverDirty, setVoiceoverDirty] = useState(false);
  const [isAdding, startAdding] = useTransition();
  const [isSavingLibrary, startSavingLibrary] = useTransition();
  const docRef = useRef(doc);
  const layoutRef = useRef(layoutKey);
  const savingRef = useRef(false);
  const dirty = useMemo(
    () => layoutKey !== savedLayoutKey || JSON.stringify(doc) !== JSON.stringify(savedDoc),
    [doc, layoutKey, savedDoc, savedLayoutKey],
  );
  const hasUnsavedChanges = dirty || voiceoverDirty;
  const mediaTarget = useMemo(() => {
    if (!mediaTargetId) return null;
    const node = findNode(doc, mediaTargetId);
    return node && !isLayout(node) && node.type === "image" ? node : null;
  }, [doc, mediaTargetId]);
  const closeMediaModal = useCallback(() => setMediaTargetId(null), []);

  useEffect(() => { docRef.current = doc; }, [doc]);
  useEffect(() => { layoutRef.current = layoutKey; }, [layoutKey]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PALETTE_STATE_KEY) ?? "null") as Partial<Record<PaletteSection, boolean>> | null;
      if (saved) setPaletteState((current) => ({ ...current, ...saved }));
    } catch {
      localStorage.removeItem(PALETTE_STATE_KEY);
    }
  }, []);

  const visibleLibraryItems = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    return availableLibraryItems.filter((item) => !query || `${item.name} ${item.node.type}`.toLowerCase().includes(query));
  }, [availableLibraryItems, libraryQuery]);

  function togglePaletteSection(section: PaletteSection) {
    setPaletteState((current) => {
      const next = { ...current, [section]: !current[section] };
      localStorage.setItem(PALETTE_STATE_KEY, JSON.stringify(next));
      return next;
    });
  }

  async function save(snapshot = docRef.current, snapshotLayout = layoutRef.current): Promise<SaveSlideResult | null> {
    if (savingRef.current) return null;
    savingRef.current = true;
    setSaveState("saving");
    setMessage("");
    try {
      const result = await saveSlideAction({
        deckId: deck.id,
        slideId: initialSlide.id,
        expectedUpdatedAt: updatedAt,
        layoutKey: snapshotLayout,
        blocks: snapshot,
      });
      if (result.status === "saved") {
        setUpdatedAt(result.updatedAt);
        setSavedDoc(snapshot);
        setSavedLayoutKey(snapshotLayout);
        setSaveState(
          layoutRef.current === snapshotLayout && JSON.stringify(docRef.current) === JSON.stringify(snapshot)
            ? "saved" : "dirty",
        );
      } else {
        setSaveState(result.status);
        setMessage(result.message);
      }
      return result;
    } catch {
      const result: SaveSlideResult = {
        status: "error",
        message: "The development server briefly disconnected. Your changes are still in this tab; try Save again.",
      };
      setSaveState(result.status);
      setMessage(result.message);
      return result;
    } finally {
      savingRef.current = false;
    }
  }

  useEffect(() => {
    if (!dirty || (saveState !== "dirty" && saveState !== "saved")) return;
    const timer = window.setTimeout(() => { void save(docRef.current); }, 2000);
    return () => window.clearTimeout(timer);
  // `save` deliberately reads the latest values from refs after the debounce.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, dirty, saveState]);

  useEffect(() => {
    function guard(event: BeforeUnloadEvent) {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [hasUnsavedChanges]);

  function updateText(id: string, text: string) {
    if (saveState !== "conflict") {
      setSaveState("dirty");
      setMessage("");
    }
    setDoc((current) => ({
      ...current,
      blocks: replaceNode(current.blocks, id, (node) => {
        if (!isTextNode(node)) return node;
        const marks = node.props.text[0] ?? { text: "" };
        return { ...node, props: { ...node.props, text: [{ ...marks, text }] } } as ContentNode;
      }),
    }));
  }

  function updateNode(id: string, update: (node: ContentNode) => ContentNode) {
    if (saveState !== "conflict") {
      setSaveState("dirty");
      setMessage("");
    }
    setDoc((current) => ({ ...current, blocks: replaceNode(current.blocks, id, update) }));
  }

  function updateSlideDesign(update: { surface?: SurfaceChoice; pattern?: SlidePatternChoice }) {
    if (saveState !== "conflict") {
      setSaveState("dirty");
      setMessage("");
    }
    setDoc((current) => {
      const style = { ...current.style, ...update };
      if (!style.surface || style.surface === "inherit") delete style.surface;
      if (!style.pattern || style.pattern === "none") delete style.pattern;
      return { ...current, style: Object.keys(style).length ? style : undefined };
    });
  }

  function markDoc(next: ReturnType<typeof appendContent>) {
    if (saveState !== "conflict") {
      setSaveState("dirty");
      setMessage("");
    }
    setDoc(next);
  }

  function addBlock(type: ContentType) {
    markDoc(appendContent(docRef.current, type));
  }

  function addLayoutBlock(type: LayoutType) {
    markDoc(appendLayout(docRef.current, type));
  }

  function changeLayout(targetKey: string) {
    if (targetKey === layoutRef.current) return;
    const migration = migrateToLayout(docRef.current, targetKey);
    if (migration.dropped.length) {
      const names = migration.dropped.map((node) => node.type).join(", ");
      if (!window.confirm(`Changing layout will remove ${migration.dropped.length} block${migration.dropped.length === 1 ? "" : "s"}: ${names}. Continue?`)) return;
    }
    setLayoutKey(targetKey);
    markDoc(migration.doc);
  }

  function removeBlock(node: Node) {
    if (!window.confirm(`Delete this ${node.type} block?`)) return;
    markDoc(deleteNode(docRef.current, node.id));
  }

  function dropBlock(sourceId: string, target: BlockDropTarget) {
    const next = moveNodeTo(docRef.current, sourceId, target.parentId, target.index);
    if (next !== docRef.current) markDoc(next);
  }

  function confirmNavigate(event: React.MouseEvent) {
    if (hasUnsavedChanges && !window.confirm("Leave before your latest changes are saved?")) event.preventDefault();
  }

  function openLibraryDialog(node: Node) {
    setLibraryTarget(node);
    setLibraryName(`${node.type.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase())} block`);
    setLibraryNotice("");
  }

  function saveToLibrary(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!libraryTarget) return;
    const target = structuredClone(libraryTarget);
    startSavingLibrary(async () => {
      try {
        const result = await saveBlockToLibraryAction({ name: libraryName, node: target });
        if (result.status === "error") {
          setLibraryNotice(result.message);
          return;
        }
        setAvailableLibraryItems((current) => [result.item, ...current.filter((item) => item.id !== result.item.id)]);
        setLibraryTarget(null);
        setLibraryNotice(`“${result.item.name}” was saved to the library.`);
      } catch {
        setLibraryNotice("The development server briefly disconnected. Try saving the block again.");
      }
    });
  }

  function insertLibraryItem(item: LibraryBlockItem) {
    markDoc({ ...docRef.current, blocks: [...docRef.current.blocks, cloneNode(item.node)] });
    setLibraryNotice(`Added a copy of “${item.name}” to slide ${initialSlide.position}.`);
  }

  function registerMedia(asset: MediaAsset) {
    setMediaItems((current) => [asset, ...current.filter((item) => item.url !== asset.url)]);
  }

  function assignMediaToImage(id: string, asset: MediaAsset) {
    updateNode(id, (current) => current.type === "image" ? {
      ...current,
      props: {
        ...current.props,
        src: asset.url,
        alt: current.props.alt || asset.name.replace(/\.[^.]+$/, "").replaceAll("-", " "),
      },
    } : current);
  }

  async function deleteMediaAsset(asset: MediaAsset) {
    if (!window.confirm(`Delete “${asset.name}” from the media library? Existing slides using it will stop displaying the image. This cannot be undone.`)) {
      return false;
    }
    const response = await fetch("/api/media", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pathname: asset.pathname }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error ?? "The image could not be deleted.");
    setMediaItems((current) => current.filter((item) => item.url !== asset.url));
    return true;
  }

  function applyImageProps(id: string, props: ContentProps["image"]) {
    updateNode(id, (current) => current.type === "image" ? { ...current, props } : current);
  }

  function swapColumns(node: LayoutNode) {
    markDoc(swapLayoutChildren(docRef.current, node.id));
  }

  function addImageFromMedia(asset: MediaAsset) {
    const image = createContentNode("image") as Extract<ContentNode, { type: "image" }>;
    const alt = asset.name.replace(/\.[^.]+$/, "").replaceAll("-", " ");
    markDoc({ ...docRef.current, blocks: [...docRef.current.blocks, { ...image, props: { ...image.props, src: asset.url, alt } }] });
    setLibraryNotice(`Added ${asset.name} to slide ${initialSlide.position}.`);
  }

  function addSlide() {
    startAdding(async () => {
      try {
        if (dirty) {
          const saved = await save();
          if (!saved || saved.status !== "saved") return;
        }
        const result = await addSlideAction(deck.id);
        if (result.status === "error") {
          setSaveState("error"); setMessage(result.message); return;
        }
        router.push(`/decks/${deck.id}/edit/${result.position}`);
        router.refresh();
      } catch {
        setSaveState("error");
        setMessage("The development server briefly disconnected. Try adding the slide again.");
      }
    });
  }

  function duplicateCurrentSlide() {
    startAdding(async () => {
      try {
        if (dirty) {
          const saved = await save();
          if (!saved || saved.status !== "saved") return;
        }
        const result = await duplicateSlideAction(deck.id, initialSlide.id);
        if (result.status === "error") {
          setSaveState("error"); setMessage(result.message); return;
        }
        router.push(`/decks/${deck.id}/edit/${result.position}`);
        router.refresh();
      } catch {
        setSaveState("error");
        setMessage("The development server briefly disconnected. Try duplicating the slide again.");
      }
    });
  }

  function deleteCurrentSlide() {
    if (!window.confirm(`Delete slide ${initialSlide.position}? This cannot be undone.`)) return;
    startAdding(async () => {
      try {
        const result = await deleteSlideAction(deck.id, initialSlide.id);
        if (result.status === "error") {
          setSaveState("error"); setMessage(result.message); return;
        }
        router.push(`/decks/${deck.id}/edit/${result.position}`);
        router.refresh();
      } catch {
        setSaveState("error");
        setMessage("The development server briefly disconnected. Try deleting the slide again.");
      }
    });
  }

  const stateLabel: Record<SaveState, string> = {
    saved: "Saved",
    dirty: "Unsaved changes",
    saving: "Saving…",
    conflict: "Save conflict",
    error: "Save failed",
  };
  // Dirty/saved is derived from the actual document diff. The state variable
  // only wins while an asynchronous or exceptional state is active.
  const visibleSaveState: SaveState = saveState === "saving" || saveState === "conflict" || saveState === "error"
    ? saveState
    : dirty ? "dirty" : "saved";

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div className="editor-branding">
          <Link href="/decks" onClick={confirmNavigate} aria-label="Back to decks">←</Link>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/lu-logomark.svg" alt="" width={32} height={32} />
          <div><strong>{deck.title}</strong><span>{deck.clientName}{deck.eventName ? ` · ${deck.eventName}` : ""}</span></div>
        </div>
        <nav className="editor-tabs" aria-label="Editor views">
          {(["design", "outline", "voiceover"] as Tab[]).map((item) => (
            <button type="button" aria-pressed={tab === item} onClick={() => setTab(item)} key={item}>{item[0].toUpperCase() + item.slice(1)}</button>
          ))}
        </nav>
        <div className="editor-actions">
          <span className={`save-state save-state-${visibleSaveState}`} aria-live="polite">{stateLabel[visibleSaveState]}</span>
          <Link className="button button-secondary" href={`/decks/${deck.id}/present`} onClick={confirmNavigate}>Present</Link>
          <Link className="button button-secondary" href="/decks" onClick={confirmNavigate}>Close</Link>
          <button className="button button-primary" type="button" onClick={() => void save()} disabled={!dirty || saveState === "saving" || saveState === "conflict"}>Save</button>
        </div>
      </header>

      {message && <div className={`editor-message editor-message-${saveState}`} role="alert">{message}{saveState === "conflict" && <button type="button" onClick={() => window.location.reload()}>Refresh slide</button>}</div>}
      {libraryNotice && !libraryTarget && <div className="editor-message editor-message-success" role="status">{libraryNotice}</div>}

      <div className="editor-body">
        <aside className="slide-strip" aria-label="Slides">
          <div className="slide-strip-heading">
            <span>Slides</span>
            <div>
              <button type="button" onClick={duplicateCurrentSlide} disabled={isAdding} aria-label="Duplicate current slide">⧉</button>
              <button type="button" onClick={deleteCurrentSlide} disabled={isAdding || deck.slides.length === 1} aria-label="Delete current slide">−</button>
              <button type="button" onClick={addSlide} disabled={isAdding} aria-label="Add slide">{isAdding ? "…" : "+"}</button>
            </div>
          </div>
          <ol>
            {deck.slides.map((slide) => (
              <li key={slide.id}>
                <Link className={slide.id === initialSlide.id ? "is-current" : ""} href={`/decks/${deck.id}/edit/${slide.position}`} onClick={confirmNavigate}>
                  <span>{slide.position}</span><div data-theme={deck.themeDefault}>{slide.blocks.blocks[0] && <MiniNode node={slide.blocks.blocks[0]} />}</div>
                </Link>
              </li>
            ))}
          </ol>
        </aside>

        <aside className="block-palette" aria-label="Block palette">
          {tab === "voiceover" ? (
            <div className="palette-note"><strong>Voiceover tools</strong><p>Each slide can have one reusable player and a manually timed caption track.</p></div>
          ) : (
            <>
              <PaletteSectionPanel id="layouts" label="Layouts" open={paletteState.layouts} onToggle={() => togglePaletteSection("layouts")}>
                <div className="layout-palette">
                  {LAYOUTS.map((layout) => (
                    <button type="button" className={layout.key === layoutKey ? "is-selected" : ""} onClick={() => changeLayout(layout.key)} key={layout.key}>
                      <span dangerouslySetInnerHTML={{ __html: layout.preview }} aria-hidden="true" />
                      <strong>{layout.name}</strong>
                    </button>
                  ))}
                </div>
              </PaletteSectionPanel>
              {tab === "design" && <PaletteSectionPanel id="design" label="Slide design" open={paletteState.design} onToggle={() => togglePaletteSection("design")}>
                <p className="palette-help">Surface colors respond to the deck mode. SVG art uses a fixed, contrast-safe foreground.</p>
                <div className="preview-theme-toggle" role="group" aria-label="Preview color mode">
                  <span>Preview</span>
                  <button type="button" aria-pressed={previewTheme === "light"} onClick={() => setPreviewTheme("light")}>Light</button>
                  <button type="button" aria-pressed={previewTheme === "dark"} onClick={() => setPreviewTheme("dark")}>Dark</button>
                </div>
                <SurfaceSwatches value={doc.style?.surface ?? "inherit"} theme={previewTheme} includeInherit onChange={(surface) => updateSlideDesign({ surface })} />
                <PatternSwatches value={doc.style?.pattern ?? "none"} onChange={(pattern) => updateSlideDesign({ pattern })} />
              </PaletteSectionPanel>}
              <PaletteSectionPanel id="content" label="Content" open={paletteState.content} onToggle={() => togglePaletteSection("content")}>
                <p className="palette-subheading">Structure</p>
                <div className="content-palette structure-palette">
                  {STRUCTURE_PALETTE.map((item) => <button type="button" onClick={() => addLayoutBlock(item.type)} key={item.type}>{item.label}</button>)}
                </div>
                <p className="palette-subheading">Blocks</p>
                <div className="content-palette">
                  {CONTENT_PALETTE.map((item) => <button type="button" onClick={() => addBlock(item.type)} key={item.type}>{item.label}</button>)}
                </div>
              </PaletteSectionPanel>
              <PaletteSectionPanel id="library" label="Library" count={availableLibraryItems.length} open={paletteState.library} onToggle={() => togglePaletteSection("library")}>
                <div className="library-palette-heading">
                  <p className="palette-help">Insert a fresh copy of a saved block.</p>
                  <Link href="/library" onClick={confirmNavigate}>Manage</Link>
                </div>
                <label className="library-search"><span className="sr-only">Search library blocks</span><input type="search" value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="Search saved blocks" /></label>
                <div className="library-palette" aria-live="polite">
                  {visibleLibraryItems.map((item) => <button type="button" onClick={() => insertLibraryItem(item)} key={item.id}><strong>{item.name}</strong><span>{item.node.type.replace(/([A-Z])/g, " $1")}</span></button>)}
                  {!visibleLibraryItems.length && <p className="library-palette-empty">{availableLibraryItems.length ? "No matching blocks." : "Save a block with the star button to build your library."}</p>}
                </div>
              </PaletteSectionPanel>
              <PaletteSectionPanel id="media" label="Media" count={mediaItems.length} open={paletteState.media} onToggle={() => togglePaletteSection("media")}>
                <p className="palette-help">Upload once, then reuse the image in any deck.</p>
                <MediaLibraryPanel items={mediaItems} configured={mediaLibrary.configured} loadError={mediaLibrary.error} onUploaded={registerMedia} onSelect={addImageFromMedia} onDelete={deleteMediaAsset} />
              </PaletteSectionPanel>
            </>
          )}
        </aside>

        <section className="editor-workspace">
          <div className="editor-context"><span>Editing slide {initialSlide.position} of {deck.slides.length}</span><span>{layoutKey.replaceAll("-", " ")} · {previewTheme} preview</span></div>
          {tab === "design" && <div className="design-workspace"><SlideCanvas doc={doc} theme={previewTheme} editor={{
            onDelete: removeBlock,
            onDuplicate: (node) => markDoc(duplicateNode(docRef.current, node.id)),
            onMove: (node, direction) => markDoc(moveNode(docRef.current, node.id, direction)),
            onDrop: dropBlock,
            onSaveToLibrary: openLibraryDialog,
            onEditImage: (node) => setMediaTargetId(node.id),
            onAssignMedia: assignMediaToImage,
            onSwapColumns: swapColumns,
          }} /></div>}
          {tab === "outline" && <div className="outline-workspace"><OutlineTree nodes={doc.blocks} media={{ items: mediaItems, onOpen: setMediaTargetId, onAssign: assignMediaToImage }} onText={updateText} onUpdate={updateNode} onMove={dropBlock} onSwapColumns={(id) => markDoc(swapLayoutChildren(docRef.current, id))} /></div>}
          <div hidden={tab !== "voiceover"}><VoiceoverEditor deckId={deck.id} slideId={initialSlide.id} configured={mediaLibrary.configured} initialVoiceover={initialSlide.voiceover} active={tab === "voiceover"} onDirtyChange={setVoiceoverDirty} /></div>
        </section>
      </div>
      {libraryTarget && (
        <div
          className="editor-dialog-backdrop"
          onMouseDown={(event) => { if (event.target === event.currentTarget && !isSavingLibrary) setLibraryTarget(null); }}
        >
          <section
            className="editor-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="library-dialog-title"
            onKeyDown={(event) => { if (event.key === "Escape" && !isSavingLibrary) setLibraryTarget(null); }}
          >
            <form onSubmit={saveToLibrary}>
              <p className="eyebrow">Reusable block</p>
              <h2 id="library-dialog-title">Save to library</h2>
              <p>Save a snapshot of this {libraryTarget.type} block. Editing the original later will not change the library copy.</p>
              <label>Library name<input autoFocus maxLength={100} required value={libraryName} onChange={(event) => { setLibraryName(event.target.value); setLibraryNotice(""); }} /></label>
              {libraryNotice && <div className="dialog-error" role="alert">{libraryNotice}</div>}
              <div className="editor-dialog-actions">
                <button className="button button-secondary" type="button" disabled={isSavingLibrary} onClick={() => setLibraryTarget(null)}>Cancel</button>
                <button className="button button-primary" type="submit" disabled={isSavingLibrary || !libraryName.trim()}>{isSavingLibrary ? "Saving…" : "Save block"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
      <MediaLibraryModal
        image={mediaTarget}
        items={mediaItems}
        configured={mediaLibrary.configured}
        loadError={mediaLibrary.error}
        onClose={closeMediaModal}
        onUploaded={registerMedia}
        onDelete={deleteMediaAsset}
        onApply={applyImageProps}
      />
    </main>
  );
}

function PaletteSectionPanel({ id, label, count, open, onToggle, children }: { id: PaletteSection; label: string; count?: number; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  const contentId = `palette-section-${id}`;
  return <section className={`palette-section${open ? " is-open" : " is-collapsed"}`}>
    <h2><button type="button" aria-expanded={open} aria-controls={contentId} onClick={onToggle}><span>{label}{count !== undefined && <small>{count}</small>}</span><i aria-hidden="true">⌄</i></button></h2>
    {open && <div className="palette-section-content" id={contentId}>{children}</div>}
  </section>;
}

function MiniNode({ node }: { node: Node }) {
  if (isLayout(node)) return <>{node.children.slice(0, 2).map((child) => <MiniNode node={child} key={child.id} />)}</>;
  if (isTextNode(node)) return <small>{plainText(node.props.text)}</small>;
  if (node.type === "statCard") return <small>{node.props.value}</small>;
  return <small>{node.type}</small>;
}

function SurfaceSwatches({ value, theme, includeInherit = false, onChange }: { value: SurfaceChoice; theme: "light" | "dark"; includeInherit?: boolean; onChange: (surface: SurfaceChoice) => void }) {
  return <div className="surface-swatches" aria-label="Surface color combination">
    {includeInherit && <button type="button" className={value === "inherit" ? "is-selected" : ""} onClick={() => onChange("inherit")}><span className="surface-inherit">Auto</span><strong>Deck</strong></button>}
    {SURFACES.map((surface) => {
      const colors = surface[theme];
      return <button type="button" className={value === surface.key ? "is-selected" : ""} aria-pressed={value === surface.key} title={surface.description} onClick={() => onChange(surface.key)} key={surface.key}>
        <span style={{ background: colors.background, color: colors.foreground }}><i style={{ background: colors.accent }} /></span><strong>{surface.label}</strong>
      </button>;
    })}
  </div>;
}

function PatternSwatches({ value, onChange }: { value: SlidePatternChoice; onChange: (pattern: SlidePatternChoice) => void }) {
  return <div className="pattern-swatches" aria-label="SVG slide background">
    <button type="button" className={value === "none" ? "is-selected" : ""} aria-pressed={value === "none"} onClick={() => onChange("none")}><span>None</span></button>
    {PATTERNS.map((pattern) => <button type="button" className={value === pattern.key ? "is-selected" : ""} aria-pressed={value === pattern.key} onClick={() => onChange(pattern.key)} key={pattern.key}><span style={{ backgroundImage: `url("${pattern.asset}")` }} /><strong>{pattern.label}</strong></button>)}
  </div>;
}

type OutlineMedia = { items: MediaAsset[]; onOpen: (id: string) => void; onAssign: (id: string, asset: MediaAsset) => void };

function OutlineTree({ nodes, media, onText, onUpdate, onMove, onSwapColumns }: { nodes: Node[]; media: OutlineMedia; onText: (id: string, text: string) => void; onUpdate: (id: string, update: (node: ContentNode) => ContentNode) => void; onMove: (sourceId: string, target: BlockDropTarget) => void; onSwapColumns: (id: string) => void }) {
  const dnd = useBlockDnd(onMove);
  return <OutlineNodes nodes={nodes} parentId={null} media={media} onText={onText} onUpdate={onUpdate} onSwapColumns={onSwapColumns} dnd={dnd} />;
}

function OutlineNodes({ nodes, parentId, media, onText, onUpdate, onSwapColumns, dnd }: { nodes: Node[]; parentId: string | null; media: OutlineMedia; onText: (id: string, text: string) => void; onUpdate: (id: string, update: (node: ContentNode) => ContentNode) => void; onSwapColumns: (id: string) => void; dnd: BlockDndController }) {
  if (!nodes.length) return <div className="outline-nodes is-empty-drop-container"><BlockDropZone axis="vertical" controller={dnd} target={{ parentId, index: 0 }} /></div>;
  return <div className="outline-nodes">{nodes.map((node, index) => {
    const before = { parentId, index };
    const after = { parentId, index: index + 1 };
    return <div className={`outline-node-slot${isActiveTarget(dnd, before) ? " is-target-before" : ""}${index === nodes.length - 1 && isActiveTarget(dnd, after) ? " is-target-after" : ""}`} key={node.id}>
      <BlockDropZone axis="vertical" controller={dnd} target={before} />
      <OutlineNode node={node} media={media} onText={onText} onUpdate={onUpdate} onSwapColumns={onSwapColumns} dnd={dnd} />
      {index === nodes.length - 1 && <BlockDropZone axis="vertical" controller={dnd} target={after} />}
    </div>;
  })}</div>;
}

function OutlineDragHeader({ node, dnd, onSwapColumns }: { node: Node; dnd: BlockDndController; onSwapColumns?: (id: string) => void }) {
  return <header
    className="outline-block-header"
    draggable
    onDragStart={(event) => {
      if ((event.target as HTMLElement).closest("button")) { event.preventDefault(); return; }
      dnd.start(event, node.id, event.currentTarget.closest(".outline-block, .outline-layout"));
    }}
    onDragEnd={() => dnd.finish()}
  >
    <span className="outline-drag-handle" aria-hidden="true">⠿</span>
    <h3>{node.type}</h3>
    {isLayout(node) && node.type === "columns" && node.children.length > 1 && onSwapColumns && <button type="button" onClick={() => onSwapColumns(node.id)}>⇄ Swap columns</button>}
  </header>;
}

function OutlineNode({ node, media, onText, onUpdate, onSwapColumns, dnd }: { node: Node; media: OutlineMedia; onText: (id: string, text: string) => void; onUpdate: (id: string, update: (node: ContentNode) => ContentNode) => void; onSwapColumns: (id: string) => void; dnd: BlockDndController }) {
  if (isLayout(node)) {
    return <section className={`outline-layout${dnd.draggingId === node.id ? " is-dragging" : ""}`} aria-label={`${node.type} layout`}><OutlineDragHeader node={node} dnd={dnd} onSwapColumns={onSwapColumns} /><OutlineNodes nodes={node.children} parentId={node.id} media={media} onText={onText} onUpdate={onUpdate} onSwapColumns={onSwapColumns} dnd={dnd} /></section>;
  }
  return (
    <section className={`outline-block${dnd.draggingId === node.id ? " is-dragging" : ""}`}>
      <OutlineDragHeader node={node} dnd={dnd} />
      {isTextNode(node) && <RichTextEditor node={node} onText={onText} />}
      {node.type === "blockquote" && <Field label="Attribution" value={node.props.attribution ?? ""} onChange={(value) => onUpdate(node.id, (current) => current.type === "blockquote" ? { ...current, props: { ...current.props, attribution: value } } : current)} />}
      {node.type === "image" && <>
        <OutlineImagePicker node={node} media={media} />
        <Field label="Image URL" hint="Or paste a hosted image URL" value={node.props.src} onChange={(value) => onUpdate(node.id, (current) => current.type === "image" ? { ...current, props: { ...current.props, src: value } } : current)} />
        <Field label="Alt text" value={node.props.alt} disabled={node.props.decorative} onChange={(value) => onUpdate(node.id, (current) => current.type === "image" ? { ...current, props: { ...current.props, alt: value } } : current)} />
        <Field label="Caption" value={node.props.caption ?? ""} onChange={(value) => onUpdate(node.id, (current) => current.type === "image" ? { ...current, props: { ...current.props, caption: value } } : current)} />
        <Check label="Decorative image" checked={node.props.decorative ?? false} onChange={(checked) => onUpdate(node.id, (current) => current.type === "image" ? { ...current, props: { ...current.props, decorative: checked } } : current)} />
      </>}
      {node.type === "list" && <>
        <Check label="Numbered list" checked={node.props.ordered} onChange={(checked) => onUpdate(node.id, (current) => current.type === "list" ? { ...current, props: { ...current.props, ordered: checked } } : current)} />
        <label>Items <small>One item per line</small><textarea rows={5} value={node.props.items.map(plainText).join("\n")} onChange={(event) => onUpdate(node.id, (current) => current.type === "list" ? { ...current, props: { ...current.props, items: event.target.value.split("\n").map((text) => [{ text }]) } } : current)} /></label>
      </>}
      {node.type === "process" && <>
        <label>Direction<select value={node.props.direction} onChange={(event) => onUpdate(node.id, (current) => current.type === "process" ? { ...current, props: { ...current.props, direction: event.target.value as "horizontal" | "vertical" } } : current)}><option value="horizontal">Horizontal timeline</option><option value="vertical">Vertical process</option></select></label>
        <label>Steps <small>One step per line; use Title | Optional detail</small><textarea rows={6} value={node.props.steps.map((step) => `${step.title}${step.detail ? ` | ${step.detail}` : ""}`).join("\n")} onChange={(event) => onUpdate(node.id, (current) => current.type === "process" ? { ...current, props: { ...current.props, steps: event.target.value.split("\n").filter((line) => line.trim()).map(splitProcessStep) } } : current)} /></label>
      </>}
      {node.type === "statCard" && <>
        <Field label="Value" value={node.props.value} onChange={(value) => onUpdate(node.id, (current) => current.type === "statCard" ? { ...current, props: { ...current.props, value } } : current)} />
        <Field label="Label" value={node.props.label} onChange={(value) => onUpdate(node.id, (current) => current.type === "statCard" ? { ...current, props: { ...current.props, label: value } } : current)} />
        <Field label="Caption" value={node.props.caption ?? ""} onChange={(value) => onUpdate(node.id, (current) => current.type === "statCard" ? { ...current, props: { ...current.props, caption: value } } : current)} />
      </>}
      {node.type === "table" && <>
        <Field label="Headers" hint="Separate columns with |" value={node.props.header.join(" | ")} onChange={(value) => onUpdate(node.id, (current) => current.type === "table" ? { ...current, props: { ...current.props, header: splitRow(value) } } : current)} />
        <label>Rows <small>One row per line; separate columns with |</small><textarea rows={5} value={node.props.rows.map((row) => row.join(" | ")).join("\n")} onChange={(event) => onUpdate(node.id, (current) => current.type === "table" ? { ...current, props: { ...current.props, rows: event.target.value.split("\n").map(splitRow) } } : current)} /></label>
      </>}
      {node.type === "pricingTable" && <label>Pricing columns <small>Name | Price | comma-separated features</small><textarea rows={6} value={node.props.columns.map((column) => `${column.name} | ${column.price} | ${column.features.join(", ")}`).join("\n")} onChange={(event) => onUpdate(node.id, (current) => current.type === "pricingTable" ? { ...current, props: { ...current.props, columns: event.target.value.split("\n").filter(Boolean).map((line) => { const [name = "", price = "", features = ""] = line.split("|").map((part) => part.trim()); return { name, price, features: features.split(",").map((feature) => feature.trim()).filter(Boolean) }; }) } } : current)} /></label>}
      {node.type === "chart" && <>
        <label>Chart type<select value={node.props.chartType} onChange={(event) => onUpdate(node.id, (current) => current.type === "chart" ? { ...current, props: { ...current.props, chartType: event.target.value as "bar" | "line" | "pie" } } : current)}><option value="bar">Bar</option><option value="line">Line</option><option value="pie">Pie</option></select></label>
        <Field label="Labels" hint="Comma separated" value={node.props.labels.join(", ")} onChange={(value) => onUpdate(node.id, (current) => current.type === "chart" ? { ...current, props: { ...current.props, labels: value.split(",").map((part) => part.trim()) } } : current)} />
        <Field label="Values" hint="Comma separated numbers" value={node.props.series.join(", ")} onChange={(value) => onUpdate(node.id, (current) => current.type === "chart" ? { ...current, props: { ...current.props, series: value.split(",").map((part) => Number(part.trim()) || 0) } } : current)} />
      </>}
    </section>
  );
}

function OutlineImagePicker({ node, media }: { node: Extract<ContentNode, { type: "image" }>; media: OutlineMedia }) {
  const [draggingOver, setDraggingOver] = useState(false);
  const selectedAsset = media.items.find((item) => item.url === node.props.src);
  return <button
    type="button"
    className={`outline-image-picker${draggingOver ? " is-dragging" : ""}`}
    onClick={() => media.onOpen(node.id)}
    onDragEnter={(event) => { if (hasMediaDrag(event.dataTransfer)) { event.preventDefault(); setDraggingOver(true); } }}
    onDragOver={(event) => { if (hasMediaDrag(event.dataTransfer)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
    onDragLeave={(event) => { if (!(event.relatedTarget instanceof HTMLElement) || !event.currentTarget.contains(event.relatedTarget)) setDraggingOver(false); }}
    onDrop={(event) => {
      const asset = readMediaDrag(event.dataTransfer);
      if (!asset) return;
      event.preventDefault();
      event.stopPropagation();
      setDraggingOver(false);
      media.onAssign(node.id, asset);
    }}
  >
    {node.props.src ? <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={node.props.src} alt="" />
    </> : <span className="outline-image-empty">Image</span>}
    <strong>{selectedAsset?.name ?? (node.props.src ? "Hosted image" : "Choose an image")}</strong>
    <small>Click to open media library · or drop existing media here</small>
  </button>;
}

function RichTextEditor({ node, onText }: { node: TextNode; onText: (id: string, text: string) => void }) {
  return <textarea value={plainText(node.props.text)} onChange={(event) => onText(node.id, event.target.value)} rows={node.type === "title" ? 2 : 4} aria-label={`${node.type} text`} />;
}

function Field({ label, value, onChange, hint, disabled = false }: { label: string; value: string; onChange: (value: string) => void; hint?: string; disabled?: boolean }) {
  return <label>{label}{hint && <small>{hint}</small>}<input type="text" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="outline-check"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function splitRow(value: string): string[] {
  return value.split("|").map((part) => part.trim());
}

function splitProcessStep(value: string): ContentProps["process"]["steps"][number] {
  const [title = "", ...detailParts] = value.split("|").map((part) => part.trim());
  const detail = detailParts.join(" | ");
  return detail ? { title, detail } : { title };
}
