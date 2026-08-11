import { nanoid } from "nanoid";
import type { ContentNode, ContentType, Node, SlideDoc } from "./types";
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
