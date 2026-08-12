/**
 * Pre-publish checks (PLAN.md §5.7, LIBRARIES.md §7.4).
 *
 * Pure and dependency-free so it can run in a server action, in a test script,
 * and later in a CI check without dragging the database along.
 */
import type { SlideDoc, Node } from "./slides/types.ts";
import { isLayout, walk } from "./slides/types.ts";
import { findUnresolved, rawText, type VariableContext } from "./variables.ts";

export type PublishIssue = {
  slidePosition: number;
  kind: "variable" | "alt-text" | "empty-image";
  detail: string;
};

/** Every string on a slide that a client would actually read. */
function readableStrings(node: Node): string[] {
  if (isLayout(node)) return [];
  const props = node.props as Record<string, unknown>;
  const out: string[] = [];

  if (Array.isArray(props.text)) out.push(rawText(props.text as never));
  for (const key of ["attribution", "caption", "alt", "value", "label"]) {
    if (typeof props[key] === "string") out.push(props[key] as string);
  }
  if (Array.isArray(props.items)) {
    for (const item of props.items) out.push(rawText(item as never));
  }
  if (Array.isArray(props.steps)) {
    for (const step of props.steps as Array<{ title?: string; detail?: string }>) {
      out.push(step.title ?? "", step.detail ?? "");
    }
  }
  if (Array.isArray(props.header)) out.push(...(props.header as string[]));
  if (Array.isArray(props.rows)) for (const row of props.rows as string[][]) out.push(...row);
  if (Array.isArray(props.columns)) {
    for (const column of props.columns as Array<{ name?: string; price?: string; features?: string[] }>) {
      out.push(column.name ?? "", column.price ?? "", ...(column.features ?? []));
    }
  }
  if (Array.isArray(props.labels)) out.push(...(props.labels as string[]));

  return out.filter(Boolean);
}

/**
 * Everything that should stop a deck going in front of a client.
 *
 * Deliberately a *warning list* rather than a hard block: the person publishing
 * can see exactly what is wrong and decide. A hard block on alt text would just
 * teach people to type "image" into the field.
 */
export function findPublishIssues(
  slides: Array<{ position: number; blocks: SlideDoc }>,
  context: VariableContext,
): PublishIssue[] {
  const issues: PublishIssue[] = [];

  for (const slide of slides) {
    walk(slide.blocks.blocks, (node) => {
      // Unresolved variables are the one that really matters: "Hi
      // {{company.name}}" reaching a client is unrecoverable.
      for (const text of readableStrings(node)) {
        for (const variable of findUnresolved(text, context)) {
          issues.push({
            slidePosition: slide.position,
            kind: "variable",
            detail: `${variable.label} has no value`,
          });
        }
      }

      if (isLayout(node) || node.type !== "image") return;
      if (!node.props.src) {
        issues.push({ slidePosition: slide.position, kind: "empty-image", detail: "An image block has no image" });
      } else if (!node.props.decorative && !node.props.alt.trim()) {
        issues.push({ slidePosition: slide.position, kind: "alt-text", detail: "An image has no alt text" });
      }
    });
  }

  // One line per distinct problem per slide; a slide with six unresolved copies
  // of the same variable is one thing to fix, not six.
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.slidePosition}:${issue.kind}:${issue.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function describeIssues(issues: PublishIssue[]): string {
  if (!issues.length) return "";
  const bySlide = new Map<number, string[]>();
  for (const issue of issues) {
    const list = bySlide.get(issue.slidePosition) ?? [];
    list.push(issue.detail);
    bySlide.set(issue.slidePosition, list);
  }
  return [...bySlide.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([position, details]) => `Slide ${position}: ${details.join("; ")}`)
    .join("\n");
}
