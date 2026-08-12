"use client";

import { useState } from "react";
import { BlockDropZone, isActiveTarget, type BlockDndController, type BlockDropTarget, useBlockDnd } from "@/components/BlockDnd";
import IconTooltip from "@/components/IconTooltip";
import type { MediaAsset } from "@/lib/data/media";
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
  return (
    <div
      className={`slide-viewport${editor ? " is-editing" : ""}${mediaDragOver ? " is-media-drop-target" : ""}`}
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
        <div className="slide-background-image" aria-hidden="true" style={{ backgroundImage: `url(${JSON.stringify(backgroundImage.src)})`, backgroundPosition: backgroundImage.position ?? "center" }} />
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
  const contentStyle = !isLayout(node) ? surfaceStyle(node.style?.surface, theme) : undefined;
  const rendered = isLayout(node)
    ? <RenderLayout node={node} theme={theme} editor={editor} dnd={dnd} />
    : <div className={`slide-node-surface${contentStyle ? " has-surface" : ""}${isFloatingImage(node) ? " is-floating-image" : ""}`} style={{ ...contentStyle, ...(!editor && isFloatingImage(node) ? floatingImageStyle(node) : undefined) }}><RenderContent node={node} onText={editor?.onText} /></div>;
  if (!editor) return rendered;
  return (
    <section
      className={`editable-slide-block editable-slide-block-${node.kind}${dnd?.draggingId === node.id ? " is-dragging" : ""}`}
      data-node-id={node.id}
      tabIndex={0}
      aria-label={`${node.type} block`}
    >
      <header className="block-chrome">
        <div
          className="block-drag-region"
          draggable
          onDragStart={(event) => {
            dnd?.start(event, node.id, event.currentTarget.closest(".editable-slide-block"));
          }}
          onDragEnd={() => dnd?.finish()}
        >
          <IconTooltip label={<><strong>Drag</strong> block</>} description="Move it to a new position.">
            <span className="block-drag-handle" tabIndex={0} aria-label={`Drag ${node.type} block`}>⠿</span>
          </IconTooltip>
          <strong>{node.type}</strong>
        </div>
        <div className="block-actions">
          <IconTooltip label={<>Move <strong>up</strong></>} description={`Move this ${node.type} earlier.`}>
            <button type="button" onClick={() => editor.onMove(node, -1)} aria-label={`Move ${node.type} up`}>↑</button>
          </IconTooltip>
          <IconTooltip label={<>Move <strong>down</strong></>} description={`Move this ${node.type} later.`}>
            <button type="button" onClick={() => editor.onMove(node, 1)} aria-label={`Move ${node.type} down`}>↓</button>
          </IconTooltip>
          <IconTooltip label={<>Duplicate <em>block</em></>} description={`Create a copy of this ${node.type}.`}>
            <button type="button" onClick={() => editor.onDuplicate(node)} aria-label={`Duplicate ${node.type}`}>⧉</button>
          </IconTooltip>
          <IconTooltip label={<>Save to <strong>library</strong></>} description="Keep a reusable copy of this block.">
            <button type="button" onClick={() => editor.onSaveToLibrary(node)} aria-label={`Save ${node.type} to library`}>☆</button>
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
        onClick={() => { if (node.type === "image") editor.onEditImage(node); }}
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
    contentEditable
    suppressContentEditableWarning
    spellCheck
    onInput={(event) => onChange(event.currentTarget.textContent ?? "")}
  >{editableText(value)}</span>;
}

function isFloatingImage(node: Node): node is Extract<ContentNode, { type: "image" }> {
  return !isLayout(node) && node.type === "image" && node.props.placement === "floating";
}

function floatingImageStyle(node: Extract<ContentNode, { type: "image" }>): React.CSSProperties {
  return {
    left: `${Math.max(0, Math.min(90, node.props.x ?? 60))}%`,
    top: `${Math.max(0, Math.min(85, node.props.y ?? 18))}%`,
    width: `${Math.max(12, Math.min(100, node.props.width ?? 30))}%`,
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
        <img className={`slide-image${frame ? " has-frame" : ""}`} style={frameStyle} src={node.props.src} alt={node.props.decorative ? "" : node.props.alt} />
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
