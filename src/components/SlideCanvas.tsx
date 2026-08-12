"use client";

import { useRef, useState } from "react";
import { BlockDropZone, isActiveTarget, type BlockDndController, type BlockDropTarget, useBlockDnd } from "@/components/BlockDnd";
import IconTooltip from "@/components/IconTooltip";
import type { MediaAsset } from "@/lib/data/media";
import { clampFloatingImage, imageAspectRatio, positionFloatingImage, snapRotation } from "@/lib/image-geometry";
import { hasMediaDrag, readMediaDrag } from "@/lib/media-dnd";
import { frameByKey, patternStyle, surfaceStyle } from "@/lib/slides/styles";
import type { ContentNode, LayoutNode, Node, RichText, SlideDoc } from "@/lib/slides/types";
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
  onSwapColumns: (node: LayoutNode) => void;
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

export default function SlideCanvas({ doc, theme, editor }: { doc: SlideDoc; theme: "light" | "dark"; editor?: SlideCanvasEditor }) {
  const [mediaDragOver, setMediaDragOver] = useState(false);
  const dnd = useBlockDnd((sourceId, target) => editor?.onDrop(sourceId, target));
  const slideStyle = doc.style?.pattern && doc.style.pattern !== "none"
    ? patternStyle(doc.style.pattern, theme)
    : surfaceStyle(doc.style?.surface, theme);
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
        <NodeList className="slide-canvas dnd-node-list-vertical" nodes={doc.blocks} parentId={null} axis="vertical" editor={editor} dnd={dnd} theme={theme} />
      ) : (
        <div className="slide-canvas">{doc.blocks.map((node) => <RenderNode node={node} theme={theme} key={node.id} />)}</div>
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
            className={`dnd-node-slot${isFloatingImage(node) ? " is-floating-slot" : ""}${isActiveTarget(dnd, before) ? " is-target-before" : ""}${index === nodes.length - 1 && isActiveTarget(dnd, after) ? " is-target-after" : ""}`}
            style={isFloatingImage(node) ? floatingImageStyle(node) : undefined}
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
    : <div className={`slide-node-surface${contentStyle ? " has-surface" : ""}${isFloatingImage(node) ? " is-floating-image" : ""}`} style={{ ...contentStyle, ...(!editor && isFloatingImage(node) ? floatingImageStyle(node) : undefined), ...rotationStyle }}><RenderContent node={node} onText={editor?.onText} /></div>;
  if (!editor) return rendered;
  const activeEditor = editor;

  function startImageMove(event: React.PointerEvent<HTMLElement>) {
    if (!isFloatingImage(node) || event.button !== 0) return;
    if (event.target instanceof HTMLElement && event.target.closest("button")) return;
    const canvas = event.currentTarget.closest(".slide-canvas");
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
    const canvas = event.currentTarget.closest(".slide-canvas");
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
        style={isFloatingImage(node) ? { aspectRatio: String(imageAspectRatio(node.props.aspectRatio)) } : undefined}
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

function editableText(value: RichText): string {
  return value.map((part) => part.text).join("");
}

function InlineText({ value, onChange, className }: { value: RichText; onChange: (text: string) => void; className?: string }) {
  return <span
    className={`direct-text-editor${className ? ` ${className}` : ""}`}
    contentEditable="plaintext-only"
    suppressContentEditableWarning
    spellCheck
    dir="ltr"
    lang="en"
    onBlur={(event) => {
      const text = event.currentTarget.innerText.replace(/\n$/, "");
      if (text !== editableText(value)) onChange(text);
    }}
  >{editableText(value)}</span>;
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

function RenderContent({ node, onText }: { node: ContentNode; onText?: (id: string, text: string) => void }) {
  switch (node.type) {
    case "title": return <h2 className="slide-title">{onText ? <InlineText value={node.props.text} onChange={(text) => onText(node.id, text)} /> : <Rich value={node.props.text} />}</h2>;
    case "tagline": return <p className="slide-tagline">{onText ? <InlineText value={node.props.text} onChange={(text) => onText(node.id, text)} /> : <Rich value={node.props.text} />}</p>;
    case "paragraph": return <p className="slide-paragraph">{onText ? <InlineText value={node.props.text} onChange={(text) => onText(node.id, text)} /> : <Rich value={node.props.text} />}</p>;
    case "blockquote": return <blockquote>{onText ? <InlineText value={node.props.text} onChange={(text) => onText(node.id, text)} /> : <Rich value={node.props.text} />}{node.props.attribution && <cite>{node.props.attribution}</cite>}</blockquote>;
    case "callout": return <aside className={`slide-callout callout-${node.props.variant}`}>{onText ? <InlineText value={node.props.text} onChange={(text) => onText(node.id, text)} /> : <Rich value={node.props.text} />}</aside>;
    case "image": {
      const frame = frameByKey(node.props.frame);
      const frameStyle = frame ? { WebkitMaskImage: `url("${frame.asset}")`, maskImage: `url("${frame.asset}")` } : undefined;
      const image = node.props.src ? (
      // User-provided image URLs can come from configured client or Blob hosts.
      // eslint-disable-next-line @next/next/no-img-element
        <img className={`slide-image${frame ? " has-frame" : ""}`} draggable={false} style={{ ...frameStyle, objectFit: node.props.fit ?? "cover", objectPosition: `${node.props.focalX ?? 50}% ${node.props.focalY ?? 50}%` }} src={node.props.src} alt={node.props.decorative ? "" : node.props.alt} />
      ) : <div className={`slide-image-placeholder${frame ? " has-frame" : ""}`} style={frameStyle} role="img" aria-label="Empty image block">Image</div>;
      return <figure className="slide-figure">{image}{node.props.caption && <figcaption>{node.props.caption}</figcaption>}</figure>;
    }
    case "list": {
      const List = node.props.ordered ? "ol" : "ul";
      return <List className="slide-list">{node.props.items.map((item, index) => <li key={index}><Rich value={item} /></li>)}</List>;
    }
    case "process": return <ol className={`slide-process is-${node.props.direction}`}>
      {node.props.steps.map((step, index) => <li key={index}>
        <span className="slide-process-marker" aria-hidden="true">{index + 1}</span>
        <div><strong>{step.title}</strong>{step.detail && <small>{step.detail}</small>}</div>
      </li>)}
    </ol>;
    case "statCard": return <div className="slide-stat"><strong>{node.props.value}</strong><span>{node.props.label}</span>{node.props.caption && <small>{node.props.caption}</small>}</div>;
    case "table": return <table className="slide-data-table"><thead><tr>{node.props.header.map((cell, i) => <th key={i}>{cell}</th>)}</tr></thead><tbody>{node.props.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table>;
    case "pricingTable": return <div className="slide-pricing">{node.props.columns.map((column, i) => <div className={column.highlighted ? "is-highlighted" : ""} key={i}><h3>{column.name}</h3><strong>{column.price}</strong><ul>{column.features.map((feature, j) => <li key={j}>{feature}</li>)}</ul></div>)}</div>;
    case "chart": return <div className="slide-chart" role="img" aria-label={`${node.props.chartType} chart with ${node.props.series.length} values`}>{node.props.series.map((value, i) => <span style={{ height: `${Math.max(4, Math.min(100, value))}%` }} title={`${node.props.labels[i] ?? i}: ${value}`} key={i} />)}</div>;
  }
}
