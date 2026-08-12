"use client";

import { useRef, useState } from "react";
import { BlockDropZone, isActiveTarget, type BlockDndController, type BlockDropTarget, useBlockDnd } from "@/components/BlockDnd";
import IconTooltip from "@/components/IconTooltip";
import { AddEntry, InlineNumber, InlineString, InlineText, RemoveEntry } from "@/components/Editable";
import type { MediaAsset } from "@/lib/data/media";
import { clampFloatingImage, positionFloatingImage, snapRotation } from "@/lib/image-geometry";
import { hasMediaDrag, readMediaDrag } from "@/lib/media-dnd";
import { frameByKey, patternStyle, surfaceStyle } from "@/lib/slides/styles";
import type { SurfaceChoice } from "@/lib/slides/styles";
import BlockSettings from "@/components/BlockSettings";
import type { BlockLayout, ContentNode, LayoutNode, Node, RichText, SlideDoc } from "@/lib/slides/types";
import { isLayout } from "@/lib/slides/types";

export type SlideCanvasEditor = {
  onDelete: (node: Node) => void;
  onDuplicate: (node: Node) => void;
  onMove: (node: Node, direction: -1 | 1) => void;
  onDrop: (sourceId: string, target: BlockDropTarget) => void;
  onSaveToLibrary: (node: Node) => void;
  onEditImage: (node: Extract<ContentNode, { type: "image" }>) => void;
  onAssignMedia: (id: string, asset: MediaAsset) => void;
  onAddFloatingMedia: (asset: MediaAsset, position: { x: number; y: number }) => void;
  onTransformImage: (id: string, update: Partial<Extract<ContentNode, { type: "image" }>["props"]>) => void;
  onText: (id: string, text: string) => void;
  /**
   * Writes any content prop on any block. `onText` predates this and stays for
   * the five plain text types; everything else — stat values, list items,
   * process steps, table cells, pricing tiers, chart data — goes through here,
   * which is what makes every block fully editable on the canvas rather than
   * only through Outline's delimiter-separated textareas.
   */
  onUpdateProps: (id: string, props: Record<string, unknown>) => void;
  /** Per-block spacing, alignment, width, and background (BlockSettings). */
  onUpdateLayout: (id: string, layout: BlockLayout) => void;
  onUpdateSurface: (id: string, surface: SurfaceChoice | undefined) => void;
  onSwapColumns: (node: LayoutNode) => void;
};

/** Named steps resolve to slide-relative percentages, so spacing scales with
 *  the slide rather than being fixed pixels that break at other sizes. */
const SPACE_SCALE: Record<string, string> = {
  none: "0", sm: "1.2%", md: "2.6%", lg: "4.4%", xl: "7%",
};

/** Turns a block's layout settings into styles the flow renderer applies. */
export function blockLayoutStyle(layout: BlockLayout | undefined): React.CSSProperties | undefined {
  if (!layout) return undefined;
  const style: React.CSSProperties = {};
  if (layout.spaceBefore) style.marginTop = SPACE_SCALE[layout.spaceBefore];
  if (layout.spaceAfter) style.marginBottom = SPACE_SCALE[layout.spaceAfter];
  if (layout.width) style.width = `${layout.width * 10}%`;
  if (layout.align && layout.align !== "stretch") {
    style.alignSelf = layout.align;
    // A width-limited block also needs its own margins to sit where it says.
    if (layout.width) {
      style.marginInlineStart = layout.align === "end" || layout.align === "center" ? "auto" : undefined;
      style.marginInlineEnd = layout.align === "start" || layout.align === "center" ? "auto" : undefined;
    }
  }
  return Object.keys(style).length ? style : undefined;
};

function Rich({ value }: { value: RichText }) {
  return value.map((part, index) => {
    let content: React.ReactNode = part.text;
    if (part.bold) content = <strong>{content}</strong>;
    if (part.italic) content = <em>{content}</em>;
    if (part.underline) content = <u>{content}</u>;
    return <span className={part.size ? `rich-${part.size}` : undefined} key={index}>{content}</span>;
  });
}

/**
 * Floating images are lifted out of the flow tree and rendered in one shared
 * layer (see `SlideCanvas`). This walks the document, returning the tree with
 * floats removed plus the floats themselves in document order.
 *
 * The stored document is untouched — a floating image keeps its place in the
 * tree for Outline, drag/drop, and library snapshots. This is purely a render
 * concern.
 */
function splitFloating(nodes: Node[]): { flow: Node[]; floating: ContentNode[] } {
  const floating: ContentNode[] = [];
  function strip(list: Node[]): Node[] {
    const kept: Node[] = [];
    for (const node of list) {
      if (isFloatingImage(node)) { floating.push(node); continue; }
      kept.push(isLayout(node) ? { ...node, children: strip(node.children) } : node);
    }
    return kept;
  }
  return { flow: strip(nodes), floating };
}

export default function SlideCanvas({ doc, theme, editor }: { doc: SlideDoc; theme: "light" | "dark"; editor?: SlideCanvasEditor }) {
  const [mediaDragOver, setMediaDragOver] = useState(false);
  const dnd = useBlockDnd((sourceId, target) => editor?.onDrop(sourceId, target));
  const slideStyle = doc.style?.pattern && doc.style.pattern !== "none"
    ? patternStyle(doc.style.pattern, theme)
    : surfaceStyle(doc.style?.surface, theme);
  const { flow, floating } = splitFloating(doc.blocks);
  const backgroundImage = doc.style?.backgroundImage;
  const backgroundPosition = backgroundImage?.focalX !== undefined || backgroundImage?.focalY !== undefined
    ? `${backgroundImage.focalX ?? 50}% ${backgroundImage.focalY ?? (backgroundImage.position === "top" ? 0 : backgroundImage.position === "bottom" ? 100 : 50)}%`
    : backgroundImage?.position ?? "center";
  return (
    <div
      className={`slide-viewport${editor ? " is-editing" : ""}${dnd.draggingId ? " is-block-dragging" : ""}${mediaDragOver ? " is-media-drop-target" : ""}`}
      data-theme={theme}
      data-pattern={doc.style?.pattern ?? "none"}
      style={slideStyle}
      onDragEnter={(event) => {
        if (!editor || !hasMediaDrag(event.dataTransfer)) return;
        event.preventDefault();
        setMediaDragOver(true);
      }}
      onDragOver={(event) => {
        if (!editor || !hasMediaDrag(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (event.relatedTarget instanceof HTMLElement && event.currentTarget.contains(event.relatedTarget)) return;
        setMediaDragOver(false);
      }}
      onDrop={(event) => {
        if (!editor) return;
        const asset = readMediaDrag(event.dataTransfer);
        if (!asset) return;
        event.preventDefault();
        setMediaDragOver(false);
        const rect = event.currentTarget.getBoundingClientRect();
        const x = Math.max(0, Math.min(72, ((event.clientX - rect.left) / rect.width) * 100 - 14));
        const y = Math.max(0, Math.min(70, ((event.clientY - rect.top) / rect.height) * 100 - 12));
        editor.onAddFloatingMedia(asset, { x, y });
      }}
    >
      {backgroundImage?.src && <>
        <div className="slide-background-image" aria-hidden="true" style={{ backgroundImage: `url(${JSON.stringify(backgroundImage.src)})`, backgroundPosition }} />
        <div className={`slide-background-overlay is-${backgroundImage.overlay ?? "soft"}`} aria-hidden="true" />
      </>}
      {editor && <span className="slide-boundary-marker" aria-hidden="true">16:9 slide boundary</span>}
      {editor ? (
        <NodeList className="slide-canvas dnd-node-list-vertical" nodes={flow} parentId={null} axis="vertical" editor={editor} dnd={dnd} theme={theme} />
      ) : (
        <div className="slide-canvas">{flow.map((node) => <RenderNode node={node} theme={theme} key={node.id} />)}</div>
      )}
      {/* One float layer for both modes.
          Floating images used to be positioned inside whatever wrapper happened
          to contain them, and in edit mode every block gets a `position:
          relative` wrapper — so an image inside a group resolved its percentages
          against the group in the editor and against the whole canvas in present
          mode. Same document, two very different slides. Hoisting every float
          into one layer that is always exactly the 16:9 box makes the two modes
          identical by construction. */}
      {floating.length > 0 && (
        <div className="slide-float-layer">
          {floating.map((node) => <RenderNode node={node} theme={theme} editor={editor} dnd={dnd} key={node.id} />)}
        </div>
      )}
    </div>
  );
}

/**
 * Read-only render of a block subtree with no slide viewport, no surface, and no
 * editing chrome — the block library's preview (LIBRARIES.md §4.2).
 *
 * Exported from here rather than reimplemented so a block previews as the same
 * markup it will produce on a slide. The difference between the two libraries is
 * exactly this: blocks preview bare, whole slides preview as slides.
 */
export function BlockTree({ nodes, theme }: { nodes: Node[]; theme: "light" | "dark" }) {
  return <>{nodes.map((node) => <RenderNode node={node} theme={theme} key={node.id} />)}</>;
}

/** Wraps a flow block so its spacing, width, and alignment apply identically in
 *  every renderer. Floats skip this — their geometry is absolute. */
function FlowFrame({ node, children }: { node: Node; children: React.ReactNode }) {
  const style = blockLayoutStyle(node.layout);
  if (!style) return <>{children}</>;
  return <div className="slide-flow-frame" style={style}>{children}</div>;
}

function NodeList({ className, nodes, parentId, axis, editor, dnd, style, theme }: { className: string; nodes: Node[]; parentId: string | null; axis: "horizontal" | "vertical"; editor: SlideCanvasEditor; dnd: BlockDndController; style?: React.CSSProperties; theme: "light" | "dark" }) {
  if (!nodes.length) {
    return <div className={`${className} is-empty-drop-container`} style={style}><BlockDropZone axis={axis} controller={dnd} target={{ parentId, index: 0 }} /></div>;
  }
  return (
    <div className={className} style={style}>
      {nodes.map((node, index) => {
        const before = { parentId, index };
        const after = { parentId, index: index + 1 };
        return (
          <div
            /* Floats never reach here — splitFloating() lifts them into the
               shared float layer before the flow tree is rendered. */
            className={`dnd-node-slot${isActiveTarget(dnd, before) ? " is-target-before" : ""}${index === nodes.length - 1 && isActiveTarget(dnd, after) ? " is-target-after" : ""}`}
            key={node.id}
          >
            <BlockDropZone axis={axis} controller={dnd} target={before} />
            <RenderNode node={node} editor={editor} dnd={dnd} theme={theme} />
            {index === nodes.length - 1 && <BlockDropZone axis={axis} controller={dnd} target={after} />}
          </div>
        );
      })}
    </div>
  );
}

function RenderNode({ node, theme, editor, dnd }: { node: Node; theme: "light" | "dark"; editor?: SlideCanvasEditor; dnd?: BlockDndController }) {
  const [mediaDragOver, setMediaDragOver] = useState(false);
  const ignoreImageClick = useRef(false);
  const contentStyle = !isLayout(node) ? surfaceStyle(node.style?.surface, theme) : undefined;
  const rotationStyle = !isLayout(node) && node.type === "image" && node.props.rotation
    ? { transform: `rotate(${node.props.rotation}deg)` }
    : undefined;
  const rendered = isLayout(node)
    ? <RenderLayout node={node} theme={theme} editor={editor} dnd={dnd} />
    /* Geometry lives on whichever element is the float layer's direct child —
       the surface when read-only, the editable wrapper when editing — never on
       both, and never at two different depths. */
    : <div className={`slide-node-surface${contentStyle ? " has-surface" : ""}${isFloatingImage(node) ? " is-floating-image" : ""}`} style={{ ...contentStyle, ...(!editor && isFloatingImage(node) ? { ...floatingImageStyle(node), ...rotationStyle } : undefined) }}><RenderContent node={node} editor={editor} /></div>;
  if (!editor) return isFloatingImage(node) ? rendered : <FlowFrame node={node}>{rendered}</FlowFrame>;
  const activeEditor = editor;

  function startImageMove(event: React.PointerEvent<HTMLElement>) {
    if (!isFloatingImage(node) || event.button !== 0) return;
    if (event.target instanceof HTMLElement && event.target.closest("button")) return;
    // Percentages are relative to the float layer, which is always the 16:9 box.
    const canvas = event.currentTarget.closest(".slide-float-layer");
    if (!(canvas instanceof HTMLElement)) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = canvas.getBoundingClientRect();
    const start = clampFloatingImage(node.props);
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    function move(pointer: PointerEvent) {
      const deltaX = pointer.clientX - startX;
      const deltaY = pointer.clientY - startY;
      if (!moved && Math.hypot(deltaX, deltaY) < 3) return;
      moved = true;
      activeEditor.onTransformImage(node.id, positionFloatingImage({
        ...start,
        x: (start.x ?? 0) + deltaX / bounds.width * 100,
        y: (start.y ?? 0) + deltaY / bounds.height * 100,
      }, pointer.shiftKey));
    }
    function finish() {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (moved) {
        ignoreImageClick.current = true;
        window.setTimeout(() => { ignoreImageClick.current = false; }, 0);
      }
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  function startImageResize(event: React.PointerEvent<HTMLButtonElement>) {
    if (!isFloatingImage(node) || event.button !== 0) return;
    // Percentages are relative to the float layer, which is always the 16:9 box.
    const canvas = event.currentTarget.closest(".slide-float-layer");
    if (!(canvas instanceof HTMLElement)) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = canvas.getBoundingClientRect();
    const start = clampFloatingImage(node.props);
    const startX = event.clientX;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    function move(pointer: PointerEvent) {
      activeEditor.onTransformImage(node.id, clampFloatingImage({
        ...start,
        width: (start.width ?? 30) + (pointer.clientX - startX) / bounds.width * 100,
      }));
    }
    function finish() {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  function startImageRotation(event: React.PointerEvent<HTMLButtonElement>) {
    if (!isFloatingImage(node) || event.button !== 0) return;
    const block = event.currentTarget.closest(".editable-slide-block");
    if (!(block instanceof HTMLElement)) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = block.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI;
    const startRotation = node.props.rotation ?? 0;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    function move(pointer: PointerEvent) {
      const angle = Math.atan2(pointer.clientY - centerY, pointer.clientX - centerX) * 180 / Math.PI;
      activeEditor.onTransformImage(node.id, { rotation: snapRotation(startRotation + angle - startAngle) });
    }
    function finish() {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  return (
    <section
      className={`editable-slide-block editable-slide-block-${node.kind}${isFloatingImage(node) ? " is-floating-image-block" : ""}${dnd?.draggingId === node.id ? " is-dragging" : ""}`}
      data-node-id={node.id}
      style={isFloatingImage(node) ? { ...floatingImageStyle(node), ...rotationStyle } : blockLayoutStyle(node.layout)}
      tabIndex={0}
      aria-label={`${node.type} block`}
      onKeyDown={(event) => {
        if (!isFloatingImage(node) || event.target !== event.currentTarget || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const step = event.shiftKey ? 5 : 1;
        editor.onTransformImage(node.id, clampFloatingImage({
          ...node.props,
          x: (node.props.x ?? 60) + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
          y: (node.props.y ?? 18) + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0),
        }));
      }}
    >
      <header className="block-chrome" onPointerDown={isFloatingImage(node) ? startImageMove : undefined}>
        <div
          className="block-drag-region"
          draggable={!isFloatingImage(node)}
          onDragStart={(event) => {
            if (isFloatingImage(node)) {
              event.preventDefault();
              return;
            }
            dnd?.start(event, node.id, event.currentTarget.closest(".editable-slide-block"));
          }}
          onDragEnd={() => dnd?.finish()}
        >
          {!isFloatingImage(node) && <IconTooltip label={<><strong>Drag</strong> block</>} description="Move it to a new position.">
            <span className="block-drag-handle" tabIndex={0} aria-label={`Drag ${node.type} block`}>⠿</span>
          </IconTooltip>}
          <strong>{node.type}</strong>
        </div>
        <div className="block-actions">
          {!isFloatingImage(node) && <><IconTooltip label={<>Move <strong>up</strong></>} description={`Move this ${node.type} earlier.`}>
            <button type="button" onClick={() => editor.onMove(node, -1)} aria-label={`Move ${node.type} up`}>↑</button>
          </IconTooltip>
          <IconTooltip label={<>Move <strong>down</strong></>} description={`Move this ${node.type} later.`}>
            <button type="button" onClick={() => editor.onMove(node, 1)} aria-label={`Move ${node.type} down`}>↓</button>
          </IconTooltip></>}
          {/* Blocks other than images stay in the flow on purpose; this is where
              the control they trade it for lives. */}
          <BlockSettings
            node={node}
            onChange={(layout) => editor.onUpdateLayout(node.id, layout)}
            onChangeSurface={(surface) => editor.onUpdateSurface(node.id, surface)}
          />
          <IconTooltip label={<>Duplicate <em>block</em></>} description={`Create a copy of this ${node.type}.`}>
            <button type="button" onClick={() => editor.onDuplicate(node)} aria-label={`Duplicate ${node.type}`}>⧉</button>
          </IconTooltip>
          {/* Bookmark, not a star: the star means "this is a personal favorite"
              in the library, and one glyph cannot mean two things. */}
          <IconTooltip label={<>Save to <strong>library</strong></>} description="Keep a reusable copy of this block.">
            <button type="button" onClick={() => editor.onSaveToLibrary(node)} aria-label={`Save ${node.type} to library`}>🔖</button>
          </IconTooltip>
          {isLayout(node) && node.type === "columns" && node.children.length > 1 && <IconTooltip label={<>Swap <strong>columns</strong></>} description="Reverse the order of the column contents.">
            <button
              type="button"
              onPointerDown={(event) => { if (event.button === 0) { event.preventDefault(); editor.onSwapColumns(node); } }}
              onClick={(event) => { if (event.detail === 0) editor.onSwapColumns(node); }}
              aria-label="Swap columns"
            >⇄</button>
          </IconTooltip>}
          <IconTooltip label={<><span className="tooltip-accent">Delete</span> block</>} description="This asks for confirmation.">
            <button type="button" onClick={() => editor.onDelete(node)} aria-label={`Delete ${node.type}`}>×</button>
          </IconTooltip>
        </div>
      </header>
      <div
        className={`editable-block-content${node.type === "image" ? " is-image-picker" : ""}${mediaDragOver ? " is-media-drop-target" : ""}`}
        role={node.type === "image" ? "button" : undefined}
        tabIndex={node.type === "image" ? 0 : undefined}
        aria-label={node.type === "image" ? "Open media library for image block" : undefined}
        title={isFloatingImage(node) ? "Drag to move freely. Hold Shift while dragging to snap to slide guides." : undefined}
        onPointerDown={startImageMove}
        onClick={() => {
          if (node.type !== "image" || ignoreImageClick.current) return;
          editor.onEditImage(node);
        }}
        onKeyDown={(event) => {
          if (node.type === "image" && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            editor.onEditImage(node);
          }
        }}
        onDragEnter={(event) => {
          if (node.type !== "image" || !hasMediaDrag(event.dataTransfer)) return;
          event.preventDefault();
          event.stopPropagation();
          setMediaDragOver(true);
        }}
        onDragOver={(event) => {
          if (node.type !== "image" || !hasMediaDrag(event.dataTransfer)) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          if (event.relatedTarget instanceof HTMLElement && event.currentTarget.contains(event.relatedTarget)) return;
          setMediaDragOver(false);
        }}
        onDrop={(event) => {
          if (node.type !== "image") return;
          const asset = readMediaDrag(event.dataTransfer);
          if (!asset) return;
          event.preventDefault();
          event.stopPropagation();
          setMediaDragOver(false);
          editor.onAssignMedia(node.id, asset);
        }}
      >{rendered}</div>
      {isFloatingImage(node) && <>
        <button className="floating-image-rotate-handle" type="button" aria-label="Rotate image" title="Drag to rotate; keyboard activation rotates 15°" onPointerDown={startImageRotation} onClick={(event) => { if (event.detail === 0) editor.onTransformImage(node.id, { rotation: snapRotation((node.props.rotation ?? 0) + 15, 0) }); }}>↻</button>
        <button className="floating-image-resize-handle" type="button" aria-label="Resize image proportionally" title="Drag to resize; keyboard activation makes the image wider" onPointerDown={startImageResize} onClick={(event) => { if (event.detail === 0) editor.onTransformImage(node.id, clampFloatingImage({ ...node.props, width: (node.props.width ?? 30) + 5 })); }}>↘</button>
      </>}
    </section>
  );
}

function RenderLayout({ node, theme, editor, dnd }: { node: LayoutNode; theme: "light" | "dark"; editor?: SlideCanvasEditor; dnd?: BlockDndController }) {
  const style = node.type === "columns" || node.type === "grid"
    ? { gridTemplateColumns: `repeat(${node.props.cols ?? 2}, minmax(0, 1fr))` }
    : undefined;
  const styledSurface = surfaceStyle(node.style?.surface, theme);
  const combinedStyle = { ...style, ...styledSurface };
  const surfaceClass = styledSurface ? " has-surface" : "";
  const axis = node.type === "row" || node.type === "columns" || node.type === "grid" ? "horizontal" : "vertical";
  if (editor && dnd) {
    return <NodeList className={`slide-layout slide-layout-${node.type} dnd-node-list-${axis}${surfaceClass}`} nodes={node.children} parentId={node.id} axis={axis} editor={editor} dnd={dnd} style={combinedStyle} theme={theme} />;
  }
  return (
    <div className={`slide-layout slide-layout-${node.type}${surfaceClass}`} style={combinedStyle}>
      {node.children.map((child) => <RenderNode node={child} theme={theme} key={child.id} />)}
    </div>
  );
}

function isFloatingImage(node: Node): node is Extract<ContentNode, { type: "image" }> {
  return !isLayout(node) && node.type === "image" && node.props.placement === "floating";
}

function floatingImageStyle(node: Extract<ContentNode, { type: "image" }>): React.CSSProperties {
  const props = clampFloatingImage(node.props);
  return {
    left: `${props.x}%`,
    top: `${props.y}%`,
    width: `${props.width}%`,
    aspectRatio: String(props.aspectRatio),
  };
}

/**
 * Every block type, fully editable in place.
 *
 * Previously only the five plain-text types could be edited on the canvas;
 * stats, lists, process steps, tables, pricing tiers, and charts were readable
 * but only editable through Outline's delimiter-separated textareas, where a
 * `|` inside someone's copy silently broke the row. Now every visible string is
 * an editable region and every repeatable collection can grow and shrink.
 *
 * `editor` absent means present/public/preview rendering — no editing affordance
 * is emitted at all, so published output is byte-identical to before.
 */
function RenderContent({ node, editor }: { node: ContentNode; editor?: SlideCanvasEditor }) {
  const onText = editor?.onText;
  /** Typed prop writer scoped to this node. */
  const set = (props: Record<string, unknown>) => editor?.onUpdateProps(node.id, props);

  switch (node.type) {
    case "title": return <h2 className="slide-title">{onText ? <InlineText value={node.props.text} label="Title" onChange={(text) => onText(node.id, text)} /> : <Rich value={node.props.text} />}</h2>;
    case "tagline": return <p className="slide-tagline">{onText ? <InlineText value={node.props.text} label="Tagline" onChange={(text) => onText(node.id, text)} /> : <Rich value={node.props.text} />}</p>;
    case "paragraph": return <p className="slide-paragraph">{onText ? <InlineText value={node.props.text} label="Paragraph" placeholder="Add supporting copy" multiline onChange={(text) => onText(node.id, text)} /> : <Rich value={node.props.text} />}</p>;

    case "blockquote": {
      const props = node.props;
      return <blockquote>
        {onText ? <InlineText value={props.text} label="Quote" multiline onChange={(text) => onText(node.id, text)} /> : <Rich value={props.text} />}
        {/* Attribution was previously only reachable from Outline. */}
        {editor
          ? <cite><InlineString value={props.attribution ?? ""} label="Quote attribution" placeholder="Who said it" onChange={(attribution) => set({ ...props, attribution })} /></cite>
          : props.attribution && <cite>{props.attribution}</cite>}
      </blockquote>;
    }

    case "callout": return <aside className={`slide-callout callout-${node.props.variant}`}>{onText ? <InlineText value={node.props.text} label="Callout" multiline onChange={(text) => onText(node.id, text)} /> : <Rich value={node.props.text} />}</aside>;

    case "image": {
      const props = node.props;
      const frame = frameByKey(props.frame);
      const frameStyle = frame ? { WebkitMaskImage: `url("${frame.asset}")`, maskImage: `url("${frame.asset}")` } : undefined;
      const image = props.src ? (
      // User-provided image URLs can come from configured client or Blob hosts.
      // eslint-disable-next-line @next/next/no-img-element
        <img className={`slide-image${frame ? " has-frame" : ""}`} draggable={false} style={{ ...frameStyle, objectFit: props.fit ?? "cover", objectPosition: `${props.focalX ?? 50}% ${props.focalY ?? 50}%` }} src={props.src} alt={props.decorative ? "" : props.alt} />
      ) : <div className={`slide-image-placeholder${frame ? " has-frame" : ""}`} style={frameStyle} role="img" aria-label="Empty image block">Image</div>;
      return <figure className="slide-figure">
        {image}
        {editor
          ? <figcaption><InlineString value={props.caption ?? ""} label="Image caption" placeholder="Add a caption" onChange={(caption) => set({ ...props, caption })} /></figcaption>
          : props.caption && <figcaption>{props.caption}</figcaption>}
      </figure>;
    }

    case "list": {
      const props = node.props;
      const List = props.ordered ? "ol" : "ul";
      if (!editor) {
        return <List className="slide-list">{props.items.map((item, index) => <li key={index}><Rich value={item} /></li>)}</List>;
      }
      const setItems = (items: RichText[]) => set({ ...props, items });
      return <div className="slide-editable-collection">
        <List className="slide-list">
          {props.items.map((item, index) => (
            <li key={index}>
              <InlineString
                value={item.map((part) => part.text).join("")}
                label={`List item ${index + 1}`} placeholder="List item"
                onChange={(text) => setItems(props.items.map((entry, i) => i === index ? [{ text }] : entry))}
              />
              <RemoveEntry
                label={`Remove list item ${index + 1}`}
                disabledReason={props.items.length <= 1 ? "A list needs at least one item." : null}
                onClick={() => setItems(props.items.filter((_, i) => i !== index))}
              />
            </li>
          ))}
        </List>
        <AddEntry label="Add item" onClick={() => setItems([...props.items, [{ text: "New item" }]])} />
      </div>;
    }

    case "process": {
      const props = node.props;
      if (!editor) {
        return <ol className={`slide-process is-${props.direction}`}>
          {props.steps.map((step, index) => <li key={index}>
            <span className="slide-process-marker" aria-hidden="true">{index + 1}</span>
            <div><strong>{step.title}</strong>{step.detail && <small>{step.detail}</small>}</div>
          </li>)}
        </ol>;
      }
      const setSteps = (steps: typeof props.steps) => set({ ...props, steps });
      return <div className="slide-editable-collection">
        <ol className={`slide-process is-${props.direction}`}>
          {props.steps.map((step, index) => <li key={index}>
            <span className="slide-process-marker" aria-hidden="true">{index + 1}</span>
            <div>
              <strong><InlineString value={step.title} label={`Step ${index + 1} title`} placeholder="Step title" onChange={(title) => setSteps(props.steps.map((entry, i) => i === index ? { ...entry, title } : entry))} /></strong>
              <small><InlineString value={step.detail ?? ""} label={`Step ${index + 1} detail`} placeholder="Optional detail" onChange={(detail) => setSteps(props.steps.map((entry, i) => i === index ? { ...entry, detail } : entry))} /></small>
            </div>
            <RemoveEntry
              label={`Remove step ${index + 1}`}
              disabledReason={props.steps.length <= 2 ? "A process needs at least two steps." : null}
              onClick={() => setSteps(props.steps.filter((_, i) => i !== index))}
            />
          </li>)}
        </ol>
        <AddEntry label="Add step" onClick={() => setSteps([...props.steps, { title: "New step", detail: "" }])} />
      </div>;
    }

    case "statCard": {
      const props = node.props;
      if (!editor) {
        return <div className="slide-stat"><strong>{props.value}</strong><span>{props.label}</span>{props.caption && <small>{props.caption}</small>}</div>;
      }
      return <div className="slide-stat">
        <strong><InlineString value={props.value} label="Stat value" placeholder="0%" onChange={(value) => set({ ...props, value })} /></strong>
        <span><InlineString value={props.label} label="Stat label" placeholder="What it measures" onChange={(label) => set({ ...props, label })} /></span>
        <small><InlineString value={props.caption ?? ""} label="Stat caption" placeholder="Optional context" onChange={(caption) => set({ ...props, caption })} /></small>
      </div>;
    }

    case "table": {
      const props = node.props;
      if (!editor) {
        return <table className="slide-data-table"><thead><tr>{props.header.map((cell, i) => <th key={i}>{cell}</th>)}</tr></thead><tbody>{props.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table>;
      }
      const columnCount = props.header.length;
      // Columns are added and removed across the header and every row together,
      // so the table can never end up ragged.
      const addColumn = () => set({
        header: [...props.header, `Column ${columnCount + 1}`],
        rows: props.rows.map((row) => [...row, ""]),
      });
      const removeColumn = (index: number) => set({
        header: props.header.filter((_, i) => i !== index),
        rows: props.rows.map((row) => row.filter((_, i) => i !== index)),
      });
      return <div className="slide-editable-collection">
        <table className="slide-data-table">
          <thead><tr>
            {props.header.map((cell, index) => <th key={index}>
              <InlineString value={cell} label={`Column ${index + 1} heading`} placeholder="Heading" onChange={(text) => set({ ...props, header: props.header.map((entry, i) => i === index ? text : entry) })} />
              <RemoveEntry
                label={`Remove column ${index + 1}`}
                disabledReason={columnCount <= 1 ? "A table needs at least one column." : null}
                onClick={() => removeColumn(index)}
              />
            </th>)}
          </tr></thead>
          <tbody>
            {props.rows.map((row, rowIndex) => <tr key={rowIndex}>
              {Array.from({ length: columnCount }, (_, columnIndex) => <td key={columnIndex}>
                <InlineString
                  value={row[columnIndex] ?? ""}
                  label={`${props.header[columnIndex] || `Column ${columnIndex + 1}`}, row ${rowIndex + 1}`}
                  placeholder="—"
                  onChange={(text) => set({ ...props, rows: props.rows.map((entry, i) => i === rowIndex ? Array.from({ length: columnCount }, (_, j) => j === columnIndex ? text : entry[j] ?? "") : entry) })}
                />
                {columnIndex === columnCount - 1 && <RemoveEntry
                  label={`Remove row ${rowIndex + 1}`}
                  disabledReason={props.rows.length <= 1 ? "A table needs at least one row." : null}
                  onClick={() => set({ ...props, rows: props.rows.filter((_, i) => i !== rowIndex) })}
                />}
              </td>)}
            </tr>)}
          </tbody>
        </table>
        <div className="slide-collection-actions">
          <AddEntry label="Add row" onClick={() => set({ ...props, rows: [...props.rows, Array.from({ length: columnCount }, () => "")] })} />
          <AddEntry label="Add column" onClick={addColumn} />
        </div>
      </div>;
    }

    case "pricingTable": {
      const props = node.props;
      if (!editor) {
        return <div className="slide-pricing">{props.columns.map((column, i) => <div className={column.highlighted ? "is-highlighted" : ""} key={i}><h3>{column.name}</h3><strong>{column.price}</strong><ul>{column.features.map((feature, j) => <li key={j}>{feature}</li>)}</ul></div>)}</div>;
      }
      const setColumns = (columns: typeof props.columns) => set({ ...props, columns });
      const patch = (index: number, update: Partial<(typeof props.columns)[number]>) =>
        setColumns(props.columns.map((entry, i) => i === index ? { ...entry, ...update } : entry));
      return <div className="slide-editable-collection">
        <div className="slide-pricing">
          {props.columns.map((column, index) => <div className={column.highlighted ? "is-highlighted" : ""} key={index}>
            <h3><InlineString value={column.name} label={`Tier ${index + 1} name`} placeholder="Tier name" onChange={(name) => patch(index, { name })} /></h3>
            <strong><InlineString value={column.price} label={`Tier ${index + 1} price`} placeholder="$0" onChange={(price) => patch(index, { price })} /></strong>
            <ul>
              {column.features.map((feature, featureIndex) => <li key={featureIndex}>
                <InlineString
                  value={feature} label={`${column.name || `Tier ${index + 1}`} feature ${featureIndex + 1}`} placeholder="Feature"
                  onChange={(text) => patch(index, { features: column.features.map((entry, i) => i === featureIndex ? text : entry) })}
                />
                <RemoveEntry
                  label={`Remove feature ${featureIndex + 1} from ${column.name || `tier ${index + 1}`}`}
                  disabledReason={column.features.length <= 1 ? "A tier needs at least one feature." : null}
                  onClick={() => patch(index, { features: column.features.filter((_, i) => i !== featureIndex) })}
                />
              </li>)}
            </ul>
            <div className="slide-collection-actions">
              <AddEntry label="Add feature" onClick={() => patch(index, { features: [...column.features, "New feature"] })} />
              <label className="slide-inline-check">
                <input type="checkbox" checked={column.highlighted ?? false} onChange={(event) => patch(index, { highlighted: event.target.checked })} />
                Highlight
              </label>
              <RemoveEntry
                label={`Remove ${column.name || `tier ${index + 1}`}`}
                disabledReason={props.columns.length <= 1 ? "A pricing table needs at least one tier." : null}
                onClick={() => setColumns(props.columns.filter((_, i) => i !== index))}
              />
            </div>
          </div>)}
        </div>
        <AddEntry label="Add tier" onClick={() => setColumns([...props.columns, { name: "New tier", price: "$0", features: ["Feature"] }])} />
      </div>;
    }

    case "chart": {
      const props = node.props;
      if (!editor) {
        return <div className="slide-chart" role="img" aria-label={`${props.chartType} chart with ${props.series.length} values`}>{props.series.map((value, i) => <span style={{ height: `${Math.max(4, Math.min(100, value))}%` }} title={`${props.labels[i] ?? i}: ${value}`} key={i} />)}</div>;
      }
      // Labels and values are edited as one list of points so they cannot drift
      // out of step with each other, which the two comma-separated Outline
      // fields allowed.
      const setPoint = (index: number, label: string, value: number) => set({
        ...props,
        labels: props.labels.map((entry, i) => i === index ? label : entry),
        series: props.series.map((entry, i) => i === index ? value : entry),
      });
      return <div className="slide-editable-collection">
        <div className="slide-chart" role="img" aria-label={`${props.chartType} chart with ${props.series.length} values`}>
          {props.series.map((value, i) => <span style={{ height: `${Math.max(4, Math.min(100, value))}%` }} title={`${props.labels[i] ?? i}: ${value}`} key={i} />)}
        </div>
        <ul className="slide-chart-data">
          {props.series.map((value, index) => <li key={index}>
            <InlineString value={props.labels[index] ?? ""} label={`Data point ${index + 1} label`} placeholder="Label" onChange={(label) => setPoint(index, label, value)} />
            <InlineNumber value={value} label={`Data point ${index + 1} value`} onChange={(next) => setPoint(index, props.labels[index] ?? "", next)} />
            <RemoveEntry
              label={`Remove data point ${index + 1}`}
              disabledReason={props.series.length <= 1 ? "A chart needs at least one value." : null}
              onClick={() => set({ ...props, labels: props.labels.filter((_, i) => i !== index), series: props.series.filter((_, i) => i !== index) })}
            />
          </li>)}
        </ul>
        <AddEntry
          label="Add data point"
          onClick={() => set({ ...props, labels: [...props.labels, `Point ${props.labels.length + 1}`], series: [...props.series, 50] })}
        />
      </div>;
    }
  }
}
