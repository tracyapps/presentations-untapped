"use client";

import { BlockDropZone, isActiveTarget, type BlockDndController, type BlockDropTarget, useBlockDnd } from "@/components/BlockDnd";
import IconTooltip from "@/components/IconTooltip";
import { frameByKey, patternStyle, surfaceStyle } from "@/lib/slides/styles";
import type { ContentNode, LayoutNode, Node, RichText, SlideDoc } from "@/lib/slides/types";
import { isLayout } from "@/lib/slides/types";

export type SlideCanvasEditor = {
  onDelete: (node: Node) => void;
  onDuplicate: (node: Node) => void;
  onMove: (node: Node, direction: -1 | 1) => void;
  onDrop: (sourceId: string, target: BlockDropTarget) => void;
  onSaveToLibrary: (node: Node) => void;
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
  const dnd = useBlockDnd((sourceId, target) => editor?.onDrop(sourceId, target));
  const slideStyle = doc.style?.pattern && doc.style.pattern !== "none"
    ? patternStyle(doc.style.pattern)
    : surfaceStyle(doc.style?.surface, theme);
  return (
    <div className="slide-viewport" data-theme={theme} data-pattern={doc.style?.pattern ?? "none"} style={slideStyle}>
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
  const contentStyle = !isLayout(node) ? surfaceStyle(node.style?.surface, theme) : undefined;
  const rendered = isLayout(node)
    ? <RenderLayout node={node} theme={theme} editor={editor} dnd={dnd} />
    : <div className={`slide-node-surface${contentStyle ? " has-surface" : ""}`} style={contentStyle}><RenderContent node={node} /></div>;
  if (!editor) return rendered;
  return (
    <section
      className={`editable-slide-block editable-slide-block-${node.kind}${dnd?.draggingId === node.id ? " is-dragging" : ""}`}
      data-node-id={node.id}
      tabIndex={0}
      aria-label={`${node.type} block`}
    >
      <header
        className="block-chrome"
        draggable
        onDragStart={(event) => {
          if ((event.target as HTMLElement).closest("button")) {
            event.preventDefault();
            return;
          }
          dnd?.start(event, node.id, event.currentTarget.closest(".editable-slide-block"));
        }}
        onDragEnd={() => dnd?.finish()}
      >
        <IconTooltip label={<><strong>Drag</strong> block</>} description="Move it to a new position.">
          <span className="block-drag-handle" tabIndex={0} aria-label={`Drag ${node.type} block`}>⠿</span>
        </IconTooltip>
        <strong>{node.type}</strong>
        <div>
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
          <IconTooltip label={<><span className="tooltip-accent">Delete</span> block</>} description="This asks for confirmation.">
            <button type="button" onClick={() => editor.onDelete(node)} aria-label={`Delete ${node.type}`}>×</button>
          </IconTooltip>
        </div>
      </header>
      <div className="editable-block-content">{rendered}</div>
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

function RenderContent({ node }: { node: ContentNode }) {
  switch (node.type) {
    case "title": return <h2 className="slide-title"><Rich value={node.props.text} /></h2>;
    case "tagline": return <p className="slide-tagline"><Rich value={node.props.text} /></p>;
    case "paragraph": return <p className="slide-paragraph"><Rich value={node.props.text} /></p>;
    case "blockquote": return <blockquote><Rich value={node.props.text} />{node.props.attribution && <cite>{node.props.attribution}</cite>}</blockquote>;
    case "callout": return <aside className={`slide-callout callout-${node.props.variant}`}><Rich value={node.props.text} /></aside>;
    case "image": {
      const frame = frameByKey(node.props.frame);
      const frameStyle = frame ? { WebkitMaskImage: `url("${frame.asset}")`, maskImage: `url("${frame.asset}")` } : undefined;
      return node.props.src ? (
      // User-provided image URLs can come from configured client or Blob hosts.
      // eslint-disable-next-line @next/next/no-img-element
        <img className={`slide-image${frame ? " has-frame" : ""}`} style={frameStyle} src={node.props.src} alt={node.props.decorative ? "" : node.props.alt} />
      ) : <div className={`slide-image-placeholder${frame ? " has-frame" : ""}`} style={frameStyle} role="img" aria-label="Empty image block">Image</div>;
    }
    case "list": {
      const List = node.props.ordered ? "ol" : "ul";
      return <List className="slide-list">{node.props.items.map((item, index) => <li key={index}><Rich value={item} /></li>)}</List>;
    }
    case "statCard": return <div className="slide-stat"><strong>{node.props.value}</strong><span>{node.props.label}</span>{node.props.caption && <small>{node.props.caption}</small>}</div>;
    case "table": return <table className="slide-data-table"><thead><tr>{node.props.header.map((cell, i) => <th key={i}>{cell}</th>)}</tr></thead><tbody>{node.props.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table>;
    case "pricingTable": return <div className="slide-pricing">{node.props.columns.map((column, i) => <div className={column.highlighted ? "is-highlighted" : ""} key={i}><h3>{column.name}</h3><strong>{column.price}</strong><ul>{column.features.map((feature, j) => <li key={j}>{feature}</li>)}</ul></div>)}</div>;
    case "chart": return <div className="slide-chart" role="img" aria-label={`${node.props.chartType} chart with ${node.props.series.length} values`}>{node.props.series.map((value, i) => <span style={{ height: `${Math.max(4, Math.min(100, value))}%` }} title={`${node.props.labels[i] ?? i}: ${value}`} key={i} />)}</div>;
  }
}
