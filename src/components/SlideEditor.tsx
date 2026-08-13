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
import PublishControl from "@/components/PublishControl";
import MediaLibraryModal from "@/components/MediaLibraryModal";
import VoiceoverEditor from "@/components/VoiceoverEditor";
import type { EditorDeck, EditorSlide } from "@/lib/data/editor";
import type { LibraryBlockItem } from "@/lib/data/library";
import type { MediaAsset, MediaLibraryData } from "@/lib/data/media";
import { clampFloatingImage } from "@/lib/image-geometry";
import { replaceMediaUrl } from "@/lib/media-references";
import { hasMediaDrag, readMediaDrag } from "@/lib/media-dnd";
import { LAYOUTS, migrateToLayout } from "@/lib/slides/layouts";
import { appendContent, appendLayout, cloneNode, createContentNode, deleteNode, duplicateNode, moveNode, moveNodeTo, swapLayoutChildren } from "@/lib/slides/editor";
import { PATTERNS, SURFACES, type SlidePatternChoice, type SurfaceChoice } from "@/lib/slides/styles";
import type { ContentNode, ContentProps, ContentType, LayoutNode, LayoutType, Node, RichText, SlideBackgroundImage, SlideDoc } from "@/lib/slides/types";
import { findNode, isLayout } from "@/lib/slides/types";

type Tab = "design" | "outline" | "voiceover";
type SaveState = "saved" | "dirty" | "saving" | "conflict" | "error";
type PaletteSection = "layouts" | "design" | "content" | "library" | "media";
type SlideNavView = "large" | "compact" | "pages";
type AddLayoutView = "large" | "compact";
type EditorPanelLayout = {
  resourceWidth: number;
  inspectorWidth: number;
  resourceVisible: boolean;
  inspectorVisible: boolean;
};
type TextNode = Extract<ContentNode, { type: "title" | "tagline" | "blockquote" | "callout" | "paragraph" }>;

const PALETTE_STATE_KEY = "lu-editor-palette-sections-v1";
const SLIDE_NAV_VIEW_KEY = "lu-editor-slide-nav-view-v1";
const ADD_LAYOUT_VIEW_KEY = "lu-editor-add-layout-view-v1";
const ADD_LAYOUT_KEY = "lu-editor-last-add-layout-v1";
const PANEL_LAYOUT_KEY = "lu-editor-panel-layout-v1";
const DEFAULT_PANEL_LAYOUT: EditorPanelLayout = {
  resourceWidth: 260,
  inspectorWidth: 230,
  resourceVisible: true,
  inspectorVisible: true,
};
const PANEL_LIMITS = {
  resourceWidth: [190, 420],
  inspectorWidth: [190, 380],
} as const;
/** How long a passing status notice (e.g. "Added X to slide 3") stays up
 *  before it clears itself. Long enough to read, short enough that it does
 *  not sit there forever the way an un-dismissed toast used to. */
const NOTICE_TIMEOUT_MS = 4500;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
  const [addLayoutKey, setAddLayoutKey] = useState(initialSlide.layoutKey);
  const [slideNavView, setSlideNavView] = useState<SlideNavView>("large");
  const [addLayoutView, setAddLayoutView] = useState<AddLayoutView>("large");
  const [panelLayout, setPanelLayout] = useState<EditorPanelLayout>(DEFAULT_PANEL_LAYOUT);
  const [savedLayoutKey, setSavedLayoutKey] = useState(initialSlide.layoutKey);
  const [updatedAt, setUpdatedAt] = useState(initialSlide.updatedAt);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [message, setMessage] = useState("");
  const [libraryNotice, setLibraryNotice] = useState("");
  const [libraryTarget, setLibraryTarget] = useState<Node | null>(null);
  const [libraryName, setLibraryName] = useState("");
  const [mediaTargetId, setMediaTargetId] = useState<string | null>(null);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [presentMenuOpen, setPresentMenuOpen] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [mediaInitialAsset, setMediaInitialAsset] = useState<MediaAsset | null>(null);
  const [backgroundDragOver, setBackgroundDragOver] = useState(false);
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
  const closeMediaModal = useCallback(() => {
    setMediaTargetId(null);
    setMediaLibraryOpen(false);
    setMediaInitialAsset(null);
  }, []);

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
  useEffect(() => {
    const nav = localStorage.getItem(SLIDE_NAV_VIEW_KEY);
    if (nav === "large" || nav === "compact" || nav === "pages") setSlideNavView(nav);
    const addView = localStorage.getItem(ADD_LAYOUT_VIEW_KEY);
    if (addView === "large" || addView === "compact") setAddLayoutView(addView);
    const lastLayout = localStorage.getItem(ADD_LAYOUT_KEY);
    if (lastLayout && LAYOUTS.some((layout) => layout.key === lastLayout)) setAddLayoutKey(lastLayout);
    try {
      const savedPanels = JSON.parse(localStorage.getItem(PANEL_LAYOUT_KEY) ?? "null") as Partial<EditorPanelLayout> | null;
      if (savedPanels) setPanelLayout({
        resourceWidth: clamp(Number(savedPanels.resourceWidth) || DEFAULT_PANEL_LAYOUT.resourceWidth, ...PANEL_LIMITS.resourceWidth),
        inspectorWidth: clamp(Number(savedPanels.inspectorWidth) || DEFAULT_PANEL_LAYOUT.inspectorWidth, ...PANEL_LIMITS.inspectorWidth),
        resourceVisible: savedPanels.resourceVisible ?? true,
        inspectorVisible: savedPanels.inspectorVisible ?? true,
      });
    } catch {
      localStorage.removeItem(PANEL_LAYOUT_KEY);
    }
  }, []);

  const visibleLibraryItems = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    return availableLibraryItems.filter((item) => !query || `${item.name} ${item.node.type}`.toLowerCase().includes(query));
  }, [availableLibraryItems, libraryQuery]);
  const navigationSlides = useMemo(() => deck.slides.map((slide) => slide.id === initialSlide.id
    ? { ...slide, blocks: doc, layoutKey }
    : slide), [deck.slides, doc, initialSlide.id, layoutKey]);

  function togglePaletteSection(section: PaletteSection) {
    setPaletteState((current) => {
      const next = { ...current, [section]: !current[section] };
      localStorage.setItem(PALETTE_STATE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function updatePanelLayout(update: Partial<EditorPanelLayout>) {
    setPanelLayout((current) => {
      const next = { ...current, ...update };
      localStorage.setItem(PANEL_LAYOUT_KEY, JSON.stringify(next));
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

  // Only the standalone toast auto-dismisses. While the "save to library"
  // dialog is open, this same state renders as its inline form error instead
  // (see the dialog below) — that one stays until the person acts on it.
  useEffect(() => {
    if (!libraryNotice || libraryTarget) return;
    const timer = window.setTimeout(() => setLibraryNotice(""), NOTICE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [libraryNotice, libraryTarget]);

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


  /** Per-block layout settings. Empty object means "back to slide defaults",
   *  so the prop is dropped rather than stored as noise. */
  function setNodeLayout(id: string, layout: import("@/lib/slides/types").BlockLayout) {
    if (saveState !== "conflict") { setSaveState("dirty"); setMessage(""); }
    const empty = Object.values(layout).every((value) => value === undefined);
    setDoc((current) => ({ ...current, blocks: mapNode(current.blocks, id, (node) => {
      const next = { ...node };
      if (empty) delete next.layout; else next.layout = layout;
      return next;
    }) }));
  }

  function setNodeSurface(id: string, surface: import("@/lib/slides/styles").SurfaceChoice | undefined) {
    if (saveState !== "conflict") { setSaveState("dirty"); setMessage(""); }
    setDoc((current) => ({ ...current, blocks: mapNode(current.blocks, id, (node) => {
      const next = { ...node };
      if (!surface || surface === "inherit") delete next.style;
      else next.style = { ...next.style, surface };
      return next;
    }) }));
  }

  /** Layout settings apply to layout blocks too, so this walks Nodes rather
   *  than reusing the ContentNode-only replaceNode above. */
  function mapNode(nodes: Node[], id: string, update: (node: Node) => Node): Node[] {
    return nodes.map((node) => {
      if (node.id === id) return update(node);
      return isLayout(node) ? { ...node, children: mapNode(node.children, id, update) } : node;
    });
  }

  function updateSlideDesign(update: Omit<Partial<NonNullable<SlideDoc["style"]>>, "backgroundImage"> & { backgroundImage?: SlideBackgroundImage | null }) {
    if (saveState !== "conflict") {
      setSaveState("dirty");
      setMessage("");
    }
    setDoc((current) => {
      const { backgroundImage, ...rest } = update;
      const style: NonNullable<SlideDoc["style"]> = { ...current.style, ...rest };
      if (backgroundImage !== undefined) {
        if (backgroundImage) style.backgroundImage = backgroundImage;
        else delete style.backgroundImage;
      }
      if (!style.surface || style.surface === "inherit") delete style.surface;
      if (!style.pattern || style.pattern === "none") delete style.pattern;
      if (!style.backgroundImage) delete style.backgroundImage;
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

  function duplicateBlock(node: Node) {
    markDoc(duplicateNode(docRef.current, node.id));
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
    // Stamp the library link on the root node. The full linked-block behavior
    // (grouped chrome, detach, edit-at-source) is LIBRARIES.md §9 step 7, but
    // recording the link now is what makes "Used in N decks" real — without it
    // an inserted block is indistinguishable from one typed by hand.
    const inserted = cloneNode(item.node);
    inserted.link = { itemId: item.id, version: item.version };

    markDoc({ ...docRef.current, blocks: [...docRef.current.blocks, inserted] });
    setLibraryNotice(`Added “${item.name}” to slide ${initialSlide.position}.`);
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
    if (!window.confirm(`Delete “${asset.name}” from the media library? This cannot be undone.`)) return false;
    async function requestDelete(force = false) {
      const response = await fetch("/api/media", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pathname: asset.pathname, force }),
      });
      const result = await response.json() as { error?: string; requiresForce?: boolean; referenceCount?: number; slideCount?: number; slidePositions?: number[] };
      return { response, result };
    }
    let deletion = await requestDelete();
    if (deletion.response.status === 409 && deletion.result.requiresForce) {
      const positions = deletion.result.slidePositions?.join(", ");
      const confirmed = window.confirm(`“${asset.name}” is used ${deletion.result.referenceCount} time${deletion.result.referenceCount === 1 ? "" : "s"} across ${deletion.result.slideCount} slide${deletion.result.slideCount === 1 ? "" : "s"}${positions ? ` (${positions})` : ""}. Delete it anyway? Those images will stop displaying.`);
      if (!confirmed) return false;
      deletion = await requestDelete(true);
    }
    if (!deletion.response.ok) throw new Error(deletion.result.error ?? "The image could not be deleted.");
    setMediaItems((current) => current.filter((item) => item.url !== asset.url));
    return true;
  }

  async function renameMediaAsset(asset: MediaAsset, name: string): Promise<{ asset: MediaAsset; message: string }> {
    const response = await fetch("/api/media", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pathname: asset.pathname, name }),
    });
    const result = await response.json() as {
      asset?: MediaAsset;
      error?: string;
      warning?: string;
      referencesUpdated?: number;
      slideVersions?: Array<{ id: string; updatedAt: string }>;
    };
    if (!response.ok || !result.asset) throw new Error(result.error ?? "The image could not be renamed.");
    const renamed = result.asset;
    setMediaItems((current) => current.map((item) => item.url === asset.url ? renamed : item));
    setMediaInitialAsset((current) => current?.url === asset.url ? renamed : current);
    setDoc((current) => replaceMediaUrl(current, asset.url, renamed.url));
    setSavedDoc((current) => replaceMediaUrl(current, asset.url, renamed.url));
    const currentVersion = result.slideVersions?.find((slide) => slide.id === initialSlide.id);
    if (currentVersion) setUpdatedAt(currentVersion.updatedAt);
    const referenceNote = result.referencesUpdated
      ? ` Updated ${result.referencesUpdated} slide reference${result.referencesUpdated === 1 ? "" : "s"}.`
      : "";
    return { asset: renamed, message: `Renamed to “${renamed.name}”.${referenceNote}${result.warning ? ` ${result.warning}` : ""}` };
  }

  async function replaceMediaEverywhere(source: MediaAsset, target: MediaAsset): Promise<{ message: string }> {
    const response = await fetch("/api/media", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourcePathname: source.pathname, targetPathname: target.pathname, deckId: deck.id }),
    });
    const result = await response.json() as {
      error?: string;
      sourceUrl?: string;
      targetUrl?: string;
      referencesUpdated?: number;
      slideCount?: number;
      slideVersions?: Array<{ id: string; updatedAt: string }>;
    };
    if (!response.ok || !result.sourceUrl || !result.targetUrl) throw new Error(result.error ?? "The image could not be replaced everywhere.");
    setDoc((current) => replaceMediaUrl(current, result.sourceUrl!, result.targetUrl!));
    setSavedDoc((current) => replaceMediaUrl(current, result.sourceUrl!, result.targetUrl!));
    const currentVersion = result.slideVersions?.find((slide) => slide.id === initialSlide.id);
    if (currentVersion) setUpdatedAt(currentVersion.updatedAt);
    const references = result.referencesUpdated ?? 0;
    const slideCount = result.slideCount ?? 0;
    return { message: `Replaced ${references} use${references === 1 ? "" : "s"} across ${slideCount} slide${slideCount === 1 ? "" : "s"}. The original file was kept.` };
  }

  function applyImageProps(id: string, props: ContentProps["image"]) {
    updateNode(id, (current) => current.type === "image" ? { ...current, props: props.placement === "floating" ? clampFloatingImage(props) : props } : current);
  }

  function transformImage(id: string, update: Partial<ContentProps["image"]>) {
    updateNode(id, (current) => current.type === "image" ? {
      ...current,
      props: current.props.placement === "floating"
        ? clampFloatingImage({ ...current.props, ...update })
        : { ...current.props, ...update },
    } : current);
  }

  function swapColumns(node: LayoutNode) {
    markDoc(swapLayoutChildren(docRef.current, node.id));
  }

  function addFloatingImageFromMedia(asset: MediaAsset, position = { x: 60, y: 18 }) {
    const image = createContentNode("image") as Extract<ContentNode, { type: "image" }>;
    const alt = asset.name.replace(/\.[^.]+$/, "").replaceAll("-", " ");
    markDoc({ ...docRef.current, blocks: [...docRef.current.blocks, {
      ...image,
      props: { ...image.props, src: asset.url, alt, placement: "floating", x: position.x, y: position.y, width: 30 },
    }] });
    setLibraryNotice(`Added ${asset.name} as a floating image on slide ${initialSlide.position}.`);
  }

  function openMediaLibrary(asset?: MediaAsset) {
    setMediaTargetId(null);
    setMediaInitialAsset(asset ?? null);
    setMediaLibraryOpen(true);
  }

  function useMediaAsBackground(asset: MediaAsset) {
    updateSlideDesign({ backgroundImage: { src: asset.url, position: "center", overlay: "soft" } });
    setLibraryNotice(`Set ${asset.name} as the background for slide ${initialSlide.position}.`);
  }

  function addSlide(selectedLayout = addLayoutKey) {
    setAddLayoutKey(selectedLayout);
    localStorage.setItem(ADD_LAYOUT_KEY, selectedLayout);
    startAdding(async () => {
      try {
        if (dirty) {
          const saved = await save();
          if (!saved || saved.status !== "saved") return;
        }
        const result = await addSlideAction(deck.id, selectedLayout);
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
          <PublishControl
            deckId={deck.id}
            status={deck.status}
            clientSlug={deck.clientSlug}
            deckSlug={deck.slug}
            publicOrigin={process.env.NEXT_PUBLIC_DECKS_ORIGIN}
          />
          {/* Split: presenting from the top is the common case and stays one
              click; presenting from where you are is the rehearsal case. */}
          <div className="editor-split">
            <Link className="button button-secondary" href={`/decks/${deck.id}/present`} onClick={confirmNavigate}>Present</Link>
            <button
              type="button" className="button button-secondary editor-split-toggle"
              aria-expanded={presentMenuOpen} aria-haspopup="menu"
              onClick={() => setPresentMenuOpen((open) => !open)}
            >
              <span aria-hidden="true">▾</span>
              <span className="sr-only">More present options</span>
            </button>
            {presentMenuOpen && (
              <div className="editor-split-menu" role="menu" onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node)) setPresentMenuOpen(false);
              }}>
                <Link role="menuitem" href={`/decks/${deck.id}/present`} onClick={(event) => { setPresentMenuOpen(false); confirmNavigate(event); }}>
                  <strong>Present from the start</strong>
                  <span>Opens at slide 1.</span>
                </Link>
                <Link role="menuitem" href={`/decks/${deck.id}/present?from=${initialSlide.position}`} onClick={(event) => { setPresentMenuOpen(false); confirmNavigate(event); }}>
                  <strong>Present from this slide</strong>
                  <span>Opens at slide {initialSlide.position} of {deck.slides.length}.</span>
                </Link>
              </div>
            )}
          </div>
          <Link className="button button-secondary" href="/decks" onClick={confirmNavigate}>Close</Link>
          <button className="button button-primary" type="button" onClick={() => void save()} disabled={!dirty || saveState === "saving" || saveState === "conflict"}>Save</button>
        </div>
      </header>

      {message && <div className={`editor-message editor-message-${saveState}`} role="alert">{message}{saveState === "conflict" && <button type="button" onClick={() => window.location.reload()}>Refresh slide</button>}</div>}

      {/* Left side, close to the panels they control — the icon-only versions
          of these buttons used to live in the header, which is also what was
          overlapping the tabs. This same strip doubles as the toast slot: a
          passing notice overlays the buttons instead of pushing the layout
          down, and it clears itself instead of sitting there indefinitely. */}
      <div className="editor-rail-toolbar">
        <button type="button" className="editor-rail-toggle" aria-pressed={panelLayout.resourceVisible} onClick={() => updatePanelLayout({ resourceVisible: !panelLayout.resourceVisible })}>
          {panelLayout.resourceVisible ? "Hide library" : "Show library"}
        </button>
        <button type="button" className="editor-rail-toggle" aria-pressed={panelLayout.inspectorVisible} onClick={() => updatePanelLayout({ inspectorVisible: !panelLayout.inspectorVisible })}>
          {panelLayout.inspectorVisible ? "Hide slide" : "Show slide"}
        </button>
        {libraryNotice && !libraryTarget && <div className="editor-message editor-message-success is-overlay" role="status">{libraryNotice}</div>}
      </div>

      <div
        className="editor-body"
        style={{
          "--editor-resource-width": `${panelLayout.resourceVisible ? panelLayout.resourceWidth : 0}px`,
          "--editor-inspector-width": `${panelLayout.inspectorVisible ? panelLayout.inspectorWidth : 0}px`,
        } as React.CSSProperties}
      >
        {panelLayout.resourceVisible && <aside className="resource-palette" aria-label="Reusable blocks and media">
          <div className="resource-palette-topbar">
            <div><strong>Library</strong></div>
          </div>

          <PaletteSectionPanel id="library" label="Library" count={availableLibraryItems.length} open={paletteState.library} onToggle={() => togglePaletteSection("library")}>
            <div className="library-palette-heading"><p className="palette-help">Insert a reusable block.</p><Link href="/library" onClick={confirmNavigate}>Open library</Link></div>
            <label className="library-search"><span className="sr-only">Search library blocks</span><input type="search" value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="Search saved blocks" /></label>
            <div className="library-palette" aria-live="polite">
              {visibleLibraryItems.map((item) => <button type="button" onClick={() => insertLibraryItem(item)} key={item.id}><strong>{item.name}</strong><span>{item.node.type.replace(/([A-Z])/g, " $1")}</span></button>)}
              {!visibleLibraryItems.length && <p className="library-palette-empty">{availableLibraryItems.length ? "No matching blocks." : "Save a block with the star button to build your library."}</p>}
            </div>
          </PaletteSectionPanel>
          <PaletteSectionPanel id="media" label="Media" count={mediaItems.length} open={paletteState.media} onToggle={() => togglePaletteSection("media")}>
            <div className="library-palette-heading"><p className="palette-help">Click to preview and choose how to use an image.</p><button type="button" className="palette-text-action" onClick={() => openMediaLibrary()}>Open library</button></div>
            <MediaLibraryPanel items={mediaItems} configured={mediaLibrary.configured} loadError={mediaLibrary.error} onUploaded={registerMedia} onSelect={openMediaLibrary} />
          </PaletteSectionPanel>
        </aside>}
        {panelLayout.resourceVisible && <ResizeHandle orientation="vertical" className="resource-resize-handle" label="Resize add slide panel" value={panelLayout.resourceWidth} min={PANEL_LIMITS.resourceWidth[0]} max={PANEL_LIMITS.resourceWidth[1]} resetValue={DEFAULT_PANEL_LAYOUT.resourceWidth} onChange={(resourceWidth) => updatePanelLayout({ resourceWidth })} />}

        {panelLayout.inspectorVisible && <aside className="block-palette" aria-label="Slide controls">
          <div className="panel-rail-header"><strong>Slide</strong></div>
          {/* Split: choosing a layout is a considered decision and gets a real
              picker; adding another of what you just used is one click. The menu
              overlays the panel below rather than pushing it, so opening it does
              not shove the Content and Design sections down the page. */}
          <div className="add-slide">
          <div className="add-slide-split">
            <button
              type="button" className="add-slide-main"
              aria-expanded={layoutMenuOpen} aria-haspopup="menu"
              disabled={isAdding}
              onClick={() => setLayoutMenuOpen((open) => !open)}
            >
              Add<br />slide <span aria-hidden="true">▾</span>
            </button>
            <button
              type="button" className="add-slide-quick"
              disabled={isAdding}
              onClick={() => addSlide()}
              title={`Add another ${LAYOUTS.find((layout) => layout.key === addLayoutKey)?.name ?? "slide"}`}
            >
              Quick<br />add
            </button>
          </div>

          {layoutMenuOpen && (
            <div className="add-slide-menu" role="menu" aria-label="Choose a slide layout">
              <div className="add-slide-menu-head">
                <strong>Choose a layout</strong>
                <PanelViewToggle
                  label="Layout menu columns" value={addLayoutView}
                  options={[{ value: "large", label: "One column", icon: "▤" }, { value: "compact", label: "Two columns", icon: "▦" }]}
                  onChange={(value) => { setAddLayoutView(value); localStorage.setItem(ADD_LAYOUT_VIEW_KEY, value); }}
                />
              </div>
              <div className={`layout-palette layout-add-palette is-${addLayoutView}`}>
                {LAYOUTS.map((layout) => (
                  <button
                    type="button" role="menuitem"
                    className={layout.key === addLayoutKey ? "is-selected" : ""}
                    onClick={() => { setLayoutMenuOpen(false); addSlide(layout.key); }}
                    disabled={isAdding} key={layout.key}
                  >
                    <span dangerouslySetInnerHTML={{ __html: layout.preview }} aria-hidden="true" />
                    <strong>{layout.name}</strong>
                  </button>
                ))}
              </div>
              <button type="button" className="add-slide-cancel" onClick={() => setLayoutMenuOpen(false)}>Cancel</button>
            </div>
          )}
          </div>
          {tab === "voiceover" ? (
            <div className="palette-note"><strong>Voiceover tools</strong><p>Each slide can have one reusable player and a manually timed caption track.</p></div>
          ) : (
            <>
              <PaletteSectionPanel id="content" label="Content" open={paletteState.content} onToggle={() => togglePaletteSection("content")}>
                <p className="palette-subheading">Structure</p>
                <div className="content-palette structure-palette">{STRUCTURE_PALETTE.map((item) => <button type="button" onClick={() => addLayoutBlock(item.type)} key={item.type}>{item.label}</button>)}</div>
                <p className="palette-subheading">Blocks</p>
                <div className="content-palette">{CONTENT_PALETTE.map((item) => <button type="button" onClick={() => addBlock(item.type)} key={item.type}>{item.label}</button>)}</div>
              </PaletteSectionPanel>
              {tab === "design" && <PaletteSectionPanel id="design" label="Slide design" open={paletteState.design} onToggle={() => togglePaletteSection("design")}>
                <p className="palette-help">Surfaces and SVG art both respond to the preview mode.</p>
                <div className="preview-theme-toggle" role="group" aria-label="Preview color mode">
                  <span>Preview</span>
                  <button type="button" aria-pressed={previewTheme === "light"} onClick={() => setPreviewTheme("light")}>Light</button>
                  <button type="button" aria-pressed={previewTheme === "dark"} onClick={() => setPreviewTheme("dark")}>Dark</button>
                </div>
                <SurfaceSwatches value={doc.style?.surface ?? "inherit"} theme={previewTheme} includeInherit onChange={(surface) => updateSlideDesign({ surface })} />
                <PatternSwatches value={doc.style?.pattern ?? "none"} onChange={(pattern) => updateSlideDesign({ pattern })} />
                <p className="palette-subheading">Background image</p>
                <div
                  className={`slide-background-dropzone${backgroundDragOver ? " is-dragging" : ""}${doc.style?.backgroundImage?.src ? " has-image" : ""}`}
                  onDragEnter={(event) => { if (hasMediaDrag(event.dataTransfer)) { event.preventDefault(); setBackgroundDragOver(true); } }}
                  onDragOver={(event) => { if (hasMediaDrag(event.dataTransfer)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
                  onDragLeave={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setBackgroundDragOver(false); }}
                  onDrop={(event) => {
                    const asset = readMediaDrag(event.dataTransfer);
                    if (!asset) return;
                    event.preventDefault();
                    setBackgroundDragOver(false);
                    useMediaAsBackground(asset);
                  }}
                >
                  {doc.style?.backgroundImage?.src ? <>
                    {/* Dynamic Blob URLs intentionally use a native image preview. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={doc.style.backgroundImage.src} alt="" />
                    <span>Drop another image to replace</span>
                  </> : <span>Drag media here to use it as the slide background</span>}
                </div>
                {doc.style?.backgroundImage?.src && <div className="slide-background-controls">
                  <label>Crop<select value={doc.style.backgroundImage.position ?? "center"} onChange={(event) => updateSlideDesign({ backgroundImage: { ...doc.style!.backgroundImage!, position: event.target.value as SlideBackgroundImage["position"] } })}><option value="center">Center</option><option value="top">Top</option><option value="bottom">Bottom</option></select></label>
                  <label>Focus X<input type="range" min={0} max={100} step={1} value={doc.style.backgroundImage.focalX ?? 50} onChange={(event) => updateSlideDesign({ backgroundImage: { ...doc.style!.backgroundImage!, focalX: Number(event.target.value) } })} /></label>
                  <label>Focus Y<input type="range" min={0} max={100} step={1} value={doc.style.backgroundImage.focalY ?? (doc.style.backgroundImage.position === "top" ? 0 : doc.style.backgroundImage.position === "bottom" ? 100 : 50)} onChange={(event) => updateSlideDesign({ backgroundImage: { ...doc.style!.backgroundImage!, focalY: Number(event.target.value) } })} /></label>
                  <label>Text overlay<select value={doc.style.backgroundImage.overlay ?? "soft"} onChange={(event) => updateSlideDesign({ backgroundImage: { ...doc.style!.backgroundImage!, overlay: event.target.value as SlideBackgroundImage["overlay"] } })}><option value="none">None</option><option value="soft">Soft</option><option value="strong">Strong</option></select></label>
                  <button type="button" onClick={() => updateSlideDesign({ backgroundImage: null })}>Remove</button>
                </div>}
              </PaletteSectionPanel>}
            </>
          )}
        </aside>}
        {panelLayout.inspectorVisible && <ResizeHandle orientation="vertical" className="inspector-resize-handle" label="Resize slide controls panel" value={panelLayout.inspectorWidth} min={PANEL_LIMITS.inspectorWidth[0]} max={PANEL_LIMITS.inspectorWidth[1]} resetValue={DEFAULT_PANEL_LAYOUT.inspectorWidth} onChange={(inspectorWidth) => updatePanelLayout({ inspectorWidth })} />}

        <SlideNavigator deckId={deck.id} slides={navigationSlides} currentSlideId={initialSlide.id} theme={previewTheme} view={slideNavView} onViewChange={(value) => { setSlideNavView(value); localStorage.setItem(SLIDE_NAV_VIEW_KEY, value); }} onNavigate={confirmNavigate} onDuplicate={duplicateCurrentSlide} onDelete={deleteCurrentSlide} deletingDisabled={isAdding || deck.slides.length === 1} />

        <section className="editor-workspace">
          <div className="editor-context">
            <span>Editing slide {initialSlide.position} of {deck.slides.length}</span>
            <label className="current-layout-control"><span>Switch slide layout</span><select value={layoutKey} onChange={(event) => changeLayout(event.target.value)}>{LAYOUTS.map((layout) => <option value={layout.key} key={layout.key}>{layout.name}</option>)}</select></label>
          </div>
          {tab === "design" && <div className="design-workspace"><SlideCanvas doc={doc} theme={previewTheme} editor={{
            onDelete: removeBlock,
            onDuplicate: duplicateBlock,
            onMove: (node, direction) => markDoc(moveNode(docRef.current, node.id, direction)),
            onDrop: dropBlock,
            onSaveToLibrary: openLibraryDialog,
            onEditImage: (node) => setMediaTargetId(node.id),
            onAssignMedia: assignMediaToImage,
            onAddFloatingMedia: addFloatingImageFromMedia,
            onTransformImage: transformImage,
            onText: updateText,
            onUpdateProps: (id, props) => updateNode(id, (current) => (
              { ...current, props: props as typeof current.props } as ContentNode
            )),
            onUpdateLayout: (id, layout) => setNodeLayout(id, layout),
            onUpdateSurface: (id, surface) => setNodeSurface(id, surface),
            onSwapColumns: swapColumns,
          }} /></div>}
          {tab === "outline" && <div className="outline-workspace"><OutlineTree nodes={doc.blocks} media={{ items: mediaItems, onOpen: setMediaTargetId, onAssign: assignMediaToImage }} onText={updateText} onUpdate={updateNode} onMove={dropBlock} onSwapColumns={(id) => markDoc(swapLayoutChildren(docRef.current, id))} onDuplicate={duplicateBlock} onDelete={removeBlock} /></div>}
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
        open={mediaLibraryOpen || !!mediaTarget}
        image={mediaTarget}
        initialAsset={mediaInitialAsset}
        items={mediaItems}
        configured={mediaLibrary.configured}
        loadError={mediaLibrary.error}
        onClose={closeMediaModal}
        onUploaded={registerMedia}
        onDelete={deleteMediaAsset}
        onRename={renameMediaAsset}
        onReplaceEverywhere={replaceMediaEverywhere}
        onApply={applyImageProps}
        onAddFloating={addFloatingImageFromMedia}
        onUseAsBackground={useMediaAsBackground}
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

function PanelViewToggle<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string; icon: string }>; onChange: (value: T) => void }) {
  return <div className="panel-view-toggle" role="group" aria-label={label}>
    {options.map((option) => <button type="button" aria-label={option.label} title={option.label} aria-pressed={value === option.value} onClick={() => onChange(option.value)} key={option.value}><span aria-hidden="true">{option.icon}</span></button>)}
  </div>;
}

function ResizeHandle({ orientation, className, label, value, min, max, resetValue, onChange }: {
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

/**
 * Duplicate/delete act on whichever slide is currently open in the workspace
 * below — there is no per-slide id plumbed through here, on purpose (see the
 * "current slide only" call in the design pass). So the controls for them
 * only ever appear on the current slide's tile: an overlay in the large and
 * compact views, and a split-button dropdown on its pill in the numbers view.
 * Proximity is the whole point — it should be obvious which slide either
 * button acts on without reading a label.
 */
function SlideNavigator({ deckId, slides, currentSlideId, theme, view, onViewChange, onNavigate, onDuplicate, onDelete, deletingDisabled }: {
  deckId: string;
  slides: EditorSlide[];
  currentSlideId: string;
  theme: "light" | "dark";
  view: SlideNavView;
  onViewChange: (view: SlideNavView) => void;
  onNavigate: (event: React.MouseEvent) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  deletingDisabled: boolean;
}) {
  const [pillMenuOpen, setPillMenuOpen] = useState(false);
  return <section className={`slide-navigator is-${view}`} aria-label="Slides">
    <div className="slide-navigator-heading">
      <strong>All slides</strong>
      <span>{slides.length}</span>
      <PanelViewToggle label="Slide navigator view" value={view} options={[{ value: "large", label: "Large thumbnails", icon: "▣" }, { value: "compact", label: "Compact slides", icon: "▤" }, { value: "pages", label: "Slide numbers", icon: "•••" }]} onChange={onViewChange} />
    </div>
    <ol className="slide-navigator-list">
      {slides.map((slide) => {
        const layout = LAYOUTS.find((item) => item.key === slide.layoutKey);
        const isCurrent = slide.id === currentSlideId;

        if (view === "pages") {
          return <li key={slide.id}>
            <div className="slide-pill">
              <Link
                className={`slide-pill-nav${isCurrent ? " is-current" : ""}`}
                href={`/decks/${deckId}/edit/${slide.position}`}
                aria-current={isCurrent ? "page" : undefined}
                onClick={(event) => { setPillMenuOpen(false); onNavigate(event); }}
              >
                {slide.position}
              </Link>
              {isCurrent && <>
                <button
                  type="button" className="slide-pill-toggle"
                  aria-label={`Actions for slide ${slide.position}`} aria-haspopup="menu" aria-expanded={pillMenuOpen}
                  onClick={() => setPillMenuOpen((open) => !open)}
                ><span aria-hidden="true">▾</span></button>
                {pillMenuOpen && (
                  <div className="slide-pill-menu" role="menu" onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node)) setPillMenuOpen(false);
                  }}>
                    <button type="button" role="menuitem" onClick={() => { setPillMenuOpen(false); onDuplicate(); }}>⧉ Duplicate slide</button>
                    <button type="button" role="menuitem" className="is-danger" disabled={deletingDisabled} onClick={() => { setPillMenuOpen(false); onDelete(); }}>− Delete slide</button>
                  </div>
                )}
              </>}
            </div>
          </li>;
        }

        return <li key={slide.id}>
          <Link className={isCurrent ? "is-current" : ""} href={`/decks/${deckId}/edit/${slide.position}`} aria-current={isCurrent ? "page" : undefined} onClick={onNavigate}>
            <span className="slide-nav-number">{slide.position}</span>
            <div className="slide-nav-preview"><SlideCanvas doc={slide.blocks} theme={theme} /></div>
            {view === "compact" && <div className="slide-nav-meta"><span dangerouslySetInnerHTML={{ __html: layout?.preview ?? "" }} aria-hidden="true" /><strong>{layout?.name ?? slide.layoutKey}</strong></div>}
          </Link>
          {/* Siblings of the Link, not children of it — buttons nested inside
              an anchor are the most common accessibility break in this exact
              pattern (LIBRARIES.md §3.4). */}
          {isCurrent && <div className="slide-nav-overlay">
            <button type="button" className="button button-secondary button-tight" onClick={onDuplicate}>⧉ <span>Duplicate</span></button>
            <button type="button" className="button button-danger button-tight" onClick={onDelete} disabled={deletingDisabled}>− <span>Delete</span></button>
          </div>}
        </li>;
      })}
    </ol>
  </section>;
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

function OutlineTree({ nodes, media, onText, onUpdate, onMove, onSwapColumns, onDuplicate, onDelete }: { nodes: Node[]; media: OutlineMedia; onText: (id: string, text: string) => void; onUpdate: (id: string, update: (node: ContentNode) => ContentNode) => void; onMove: (sourceId: string, target: BlockDropTarget) => void; onSwapColumns: (id: string) => void; onDuplicate: (node: Node) => void; onDelete: (node: Node) => void }) {
  const dnd = useBlockDnd(onMove);
  return <OutlineNodes nodes={nodes} parentId={null} media={media} onText={onText} onUpdate={onUpdate} onSwapColumns={onSwapColumns} onDuplicate={onDuplicate} onDelete={onDelete} dnd={dnd} />;
}

function OutlineNodes({ nodes, parentId, media, onText, onUpdate, onSwapColumns, onDuplicate, onDelete, dnd }: { nodes: Node[]; parentId: string | null; media: OutlineMedia; onText: (id: string, text: string) => void; onUpdate: (id: string, update: (node: ContentNode) => ContentNode) => void; onSwapColumns: (id: string) => void; onDuplicate: (node: Node) => void; onDelete: (node: Node) => void; dnd: BlockDndController }) {
  if (!nodes.length) return <div className="outline-nodes is-empty-drop-container"><BlockDropZone axis="vertical" controller={dnd} target={{ parentId, index: 0 }} /></div>;
  return <div className="outline-nodes">{nodes.map((node, index) => {
    const before = { parentId, index };
    const after = { parentId, index: index + 1 };
    return <div className={`outline-node-slot${isActiveTarget(dnd, before) ? " is-target-before" : ""}${index === nodes.length - 1 && isActiveTarget(dnd, after) ? " is-target-after" : ""}`} key={node.id}>
      <BlockDropZone axis="vertical" controller={dnd} target={before} />
      <OutlineNode node={node} media={media} onText={onText} onUpdate={onUpdate} onSwapColumns={onSwapColumns} onDuplicate={onDuplicate} onDelete={onDelete} dnd={dnd} />
      {index === nodes.length - 1 && <BlockDropZone axis="vertical" controller={dnd} target={after} />}
    </div>;
  })}</div>;
}

function OutlineDragHeader({ node, dnd, onSwapColumns, onDuplicate, onDelete }: { node: Node; dnd: BlockDndController; onSwapColumns?: (id: string) => void; onDuplicate: (node: Node) => void; onDelete: (node: Node) => void }) {
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
    <div className="outline-block-actions">
      {isLayout(node) && node.type === "columns" && node.children.length > 1 && onSwapColumns && <button type="button" onClick={() => onSwapColumns(node.id)}>⇄ Swap columns</button>}
      <button type="button" onClick={() => onDuplicate(node)} aria-label={`Duplicate ${node.type} block`}>⧉ Duplicate</button>
      <button type="button" className="is-danger" onClick={() => onDelete(node)} aria-label={`Delete ${node.type} block`}>× Delete</button>
    </div>
  </header>;
}

function OutlineNode({ node, media, onText, onUpdate, onSwapColumns, onDuplicate, onDelete, dnd }: { node: Node; media: OutlineMedia; onText: (id: string, text: string) => void; onUpdate: (id: string, update: (node: ContentNode) => ContentNode) => void; onSwapColumns: (id: string) => void; onDuplicate: (node: Node) => void; onDelete: (node: Node) => void; dnd: BlockDndController }) {
  if (isLayout(node)) {
    return <section className={`outline-layout${dnd.draggingId === node.id ? " is-dragging" : ""}`} aria-label={`${node.type} layout`}><OutlineDragHeader node={node} dnd={dnd} onSwapColumns={onSwapColumns} onDuplicate={onDuplicate} onDelete={onDelete} /><OutlineNodes nodes={node.children} parentId={node.id} media={media} onText={onText} onUpdate={onUpdate} onSwapColumns={onSwapColumns} onDuplicate={onDuplicate} onDelete={onDelete} dnd={dnd} /></section>;
  }
  return (
    <section className={`outline-block${dnd.draggingId === node.id ? " is-dragging" : ""}`}>
      <OutlineDragHeader node={node} dnd={dnd} onDuplicate={onDuplicate} onDelete={onDelete} />
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
