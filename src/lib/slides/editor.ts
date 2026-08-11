import { nanoid } from "nanoid";
import type { ContentNode, ContentType, LayoutNode, LayoutType, Node, SlideDoc } from "./types";
import { isLayout } from "./types";

export function createContentNode(type: ContentType): ContentNode {
  const base = { id: nanoid(8), kind: "content" as const };
  switch (type) {
    case "title": return { ...base, type, props: { text: [{ text: "New title" }] } };
    case "tagline": return { ...base, type, props: { text: [{ text: "A concise supporting line" }] } };
    case "blockquote": return { ...base, type, props: { text: [{ text: "A memorable quote" }], attribution: "Attribution" } };
    case "callout": return { ...base, type, props: { text: [{ text: "Important takeaway" }], variant: "accent" } };
    case "paragraph": return { ...base, type, props: { text: [{ text: "Add supporting copy." }] } };
    case "image": return { ...base, type, props: { src: "", alt: "" } };
    case "list": return { ...base, type, props: { ordered: false, items: [[{ text: "First point" }], [{ text: "Second point" }]] } };
    case "process": return { ...base, type, props: { direction: "horizontal", steps: [
      { title: "First step", detail: "What happens here" },
      { title: "Second step", detail: "What happens next" },
      { title: "Third step", detail: "The resulting outcome" },
    ] } };
    case "statCard": return { ...base, type, props: { value: "0%", label: "Key metric" } };
    case "table": return { ...base, type, props: { header: ["Column 1", "Column 2"], rows: [["Value", "Value"]] } };
    case "pricingTable": return { ...base, type, props: { columns: [
      { name: "Option 1", price: "$0", features: ["Feature"] },
      { name: "Option 2", price: "$0", features: ["Feature"], highlighted: true },
      { name: "Option 3", price: "$0", features: ["Feature"] },
    ] } };
    case "chart": return { ...base, type, props: { chartType: "bar", labels: ["A", "B", "C"], series: [35, 65, 50] } };
  }
}

export function appendContent(doc: SlideDoc, type: ContentType): SlideDoc {
  return { ...doc, blocks: [...doc.blocks, createContentNode(type)] };
}

export function createLayoutNode(type: LayoutType): LayoutNode {
  return {
    id: nanoid(8),
    kind: "layout",
    type,
    props: type === "columns" || type === "grid" ? { cols: 2 } : {},
    children: [],
  };
}

export function appendLayout(doc: SlideDoc, type: LayoutType): SlideDoc {
  return { ...doc, blocks: [...doc.blocks, createLayoutNode(type)] };
}

export function cloneNode(node: Node): Node {
  if (isLayout(node)) {
    return { ...node, id: nanoid(8), children: node.children.map(cloneNode) };
  }
  return { ...structuredClone(node), id: nanoid(8) };
}

export function cloneDoc(doc: SlideDoc): SlideDoc {
  return { ...doc, blocks: doc.blocks.map(cloneNode) };
}

function updateAtAnyDepth(nodes: Node[], targetId: string, operation: (nodes: Node[], index: number) => Node[]): Node[] {
  const directIndex = nodes.findIndex((node) => node.id === targetId);
  if (directIndex !== -1) return operation(nodes, directIndex);
  return nodes.map((node) => isLayout(node)
    ? { ...node, children: updateAtAnyDepth(node.children, targetId, operation) }
    : node);
}

export function duplicateNode(doc: SlideDoc, id: string): SlideDoc {
  return {
    ...doc,
    blocks: updateAtAnyDepth(doc.blocks, id, (nodes, index) => [
      ...nodes.slice(0, index + 1),
      cloneNode(nodes[index]),
      ...nodes.slice(index + 1),
    ]),
  };
}

export function deleteNode(doc: SlideDoc, id: string): SlideDoc {
  return {
    ...doc,
    blocks: updateAtAnyDepth(doc.blocks, id, (nodes, index) => [
      ...nodes.slice(0, index),
      ...nodes.slice(index + 1),
    ]),
  };
}

export function moveNode(doc: SlideDoc, id: string, direction: -1 | 1): SlideDoc {
  return {
    ...doc,
    blocks: updateAtAnyDepth(doc.blocks, id, (nodes, index) => {
      const destination = index + direction;
      if (destination < 0 || destination >= nodes.length) return nodes;
      const next = [...nodes];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    }),
  };
}

export function swapLayoutChildren(doc: SlideDoc, id: string): SlideDoc {
  return {
    ...doc,
    blocks: doc.blocks.map(function swap(node): Node {
      if (!isLayout(node)) return node;
      if (node.id === id && node.type === "columns" && node.children.length > 1) {
        return { ...node, children: [...node.children].reverse() };
      }
      return { ...node, children: node.children.map(swap) };
    }),
  };
}

type NodeLocation = { index: number; node: Node; parentId: string | null };

function findLocation(nodes: Node[], id: string, parentId: string | null = null): NodeLocation | null {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.id === id) return { index, node, parentId };
    if (isLayout(node)) {
      const nested = findLocation(node.children, id, node.id);
      if (nested) return nested;
    }
  }
  return null;
}

function containsNode(node: Node, id: string): boolean {
  return node.id === id || (isLayout(node) && node.children.some((child) => containsNode(child, id)));
}

function updateParentChildren(
  nodes: Node[],
  parentId: string | null,
  update: (children: Node[]) => Node[],
): Node[] {
  if (parentId === null) return update(nodes);
  return nodes.map((node) => {
    if (!isLayout(node)) return node;
    if (node.id === parentId) return { ...node, children: update(node.children) };
    return { ...node, children: updateParentChildren(node.children, parentId, update) };
  });
}

/**
 * Move a node to an insertion point at any tree depth. The operation refuses
 * cycles (a layout cannot move inside itself or one of its descendants) and
 * returns the original document for invalid or no-op drops.
 */
export function moveNodeTo(
  doc: SlideDoc,
  sourceId: string,
  targetParentId: string | null,
  targetIndex: number,
): SlideDoc {
  const source = findLocation(doc.blocks, sourceId);
  if (!source) return doc;

  if (targetParentId !== null) {
    const targetParent = findLocation(doc.blocks, targetParentId)?.node;
    if (!targetParent || !isLayout(targetParent) || containsNode(source.node, targetParentId)) return doc;
  }

  const targetChildren = targetParentId === null
    ? doc.blocks
    : (findLocation(doc.blocks, targetParentId)?.node as Extract<Node, { kind: "layout" }>).children;
  let insertionIndex = Math.max(0, Math.min(targetIndex, targetChildren.length));
  if (source.parentId === targetParentId && source.index < insertionIndex) insertionIndex -= 1;
  if (source.parentId === targetParentId && source.index === insertionIndex) return doc;

  const withoutSource = updateParentChildren(doc.blocks, source.parentId, (children) => [
    ...children.slice(0, source.index),
    ...children.slice(source.index + 1),
  ]);
  const withSource = updateParentChildren(withoutSource, targetParentId, (children) => [
    ...children.slice(0, insertionIndex),
    source.node,
    ...children.slice(insertionIndex),
  ]);
  return { ...doc, blocks: withSource };
}
