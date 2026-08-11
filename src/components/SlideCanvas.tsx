import type { ContentNode, LayoutNode, Node, RichText, SlideDoc } from "@/lib/slides/types";
import { isLayout } from "@/lib/slides/types";

export type SlideCanvasEditor = {
  onDelete: (node: Node) => void;
  onDuplicate: (node: Node) => void;
  onMove: (node: Node, direction: -1 | 1) => void;
  onDrop: (sourceId: string, targetId: string) => void;
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
  return (
    <div className="slide-viewport" data-theme={theme}>
      <div className="slide-canvas">
        {doc.blocks.map((node) => <RenderNode node={node} editor={editor} key={node.id} />)}
      </div>
    </div>
  );
}

function RenderNode({ node, editor }: { node: Node; editor?: SlideCanvasEditor }) {
  const rendered = isLayout(node) ? <RenderLayout node={node} editor={editor} /> : <RenderContent node={node} />;
  if (!editor) return rendered;
  return (
    <section
      className={`editable-slide-block editable-slide-block-${node.kind}`}
      tabIndex={0}
      draggable
      aria-label={`${node.type} block`}
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", node.id);
      }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const sourceId = event.dataTransfer.getData("text/plain");
        if (sourceId) editor.onDrop(sourceId, node.id);
      }}
    >
      <header className="block-chrome">
        <span aria-hidden="true">⠿</span><strong>{node.type}</strong>
        <div>
          <button type="button" onClick={() => editor.onMove(node, -1)} aria-label={`Move ${node.type} up`}>↑</button>
          <button type="button" onClick={() => editor.onMove(node, 1)} aria-label={`Move ${node.type} down`}>↓</button>
          <button type="button" onClick={() => editor.onDuplicate(node)} aria-label={`Duplicate ${node.type}`}>⧉</button>
          <button type="button" onClick={() => editor.onDelete(node)} aria-label={`Delete ${node.type}`}>×</button>
        </div>
      </header>
      <div className="editable-block-content">{rendered}</div>
    </section>
  );
}

function RenderLayout({ node, editor }: { node: LayoutNode; editor?: SlideCanvasEditor }) {
  const style = node.type === "columns" || node.type === "grid"
    ? { gridTemplateColumns: `repeat(${node.props.cols ?? 2}, minmax(0, 1fr))` }
    : undefined;
  return (
    <div className={`slide-layout slide-layout-${node.type}`} style={style}>
      {node.children.map((child) => <RenderNode node={child} editor={editor} key={child.id} />)}
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
    case "image": return node.props.src ? (
      // User-provided image URLs can come from configured client or Blob hosts.
      // eslint-disable-next-line @next/next/no-img-element
      <img className="slide-image" src={node.props.src} alt={node.props.decorative ? "" : node.props.alt} />
    ) : <div className="slide-image-placeholder" role="img" aria-label="Empty image block">Image</div>;
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
