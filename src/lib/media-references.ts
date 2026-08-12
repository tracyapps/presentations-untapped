import type { Node, SlideDoc } from "./slides/types";

function countInNode(node: Node, url: string): number {
  if (node.kind === "layout") return node.children.reduce((total, child) => total + countInNode(child, url), 0);
  return node.type === "image" && node.props.src === url ? 1 : 0;
}

function replaceInNode(node: Node, fromUrl: string, toUrl: string): Node {
  if (node.kind === "layout") return { ...node, children: node.children.map((child) => replaceInNode(child, fromUrl, toUrl)) };
  if (node.type !== "image" || node.props.src !== fromUrl) return node;
  return { ...node, props: { ...node.props, src: toUrl } };
}

export function countMediaReferences(doc: SlideDoc, url: string): number {
  const backgroundCount = doc.style?.backgroundImage?.src === url ? 1 : 0;
  return backgroundCount + doc.blocks.reduce((total, node) => total + countInNode(node, url), 0);
}

export function replaceMediaUrl(doc: SlideDoc, fromUrl: string, toUrl: string): SlideDoc {
  if (!countMediaReferences(doc, fromUrl)) return doc;
  const backgroundImage = doc.style?.backgroundImage;
  return {
    ...doc,
    style: backgroundImage?.src === fromUrl
      ? { ...doc.style, backgroundImage: { ...backgroundImage, src: toUrl } }
      : doc.style,
    blocks: doc.blocks.map((node) => replaceInNode(node, fromUrl, toUrl)),
  };
}
