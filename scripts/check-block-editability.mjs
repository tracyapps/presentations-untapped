import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Guards the rule that every block type is fully editable on the canvas.
 *
 * The gap this catches: a block type ships, renders beautifully, and turns out
 * to have props nobody can edit without hand-writing JSON. That happened to
 * statCard, list, process, table, pricingTable, and chart — all of them were
 * readable on the canvas but only editable through Outline's delimiter-based
 * textareas.
 *
 * This is a source-shape check, not a render test. It is deliberately cheap so
 * it runs on every change, and it fails loudly when a new block type is added
 * without an editing path.
 */

const canvas = readFileSync(new URL("../src/components/SlideCanvas.tsx", import.meta.url), "utf8");
const types = readFileSync(new URL("../src/lib/slides/types.ts", import.meta.url), "utf8");

/* --- 1. Every ContentType has a case in RenderContent ----------------- */

const contentTypeBlock = types.match(/export type ContentType =([\s\S]*?);/);
assert.ok(contentTypeBlock, "ContentType union not found in types.ts");
const contentTypes = [...contentTypeBlock[1].matchAll(/"([a-zA-Z]+)"/g)].map((match) => match[1]);
assert.ok(contentTypes.length >= 12, `expected at least 12 block types, found ${contentTypes.length}`);

const renderContent = canvas.slice(canvas.indexOf("function RenderContent"));
for (const type of contentTypes) {
  assert.ok(
    renderContent.includes(`case "${type}":`),
    `RenderContent has no case for block type "${type}"`,
  );
}

/* --- 2. Every editable prop is reachable ------------------------------ */

/** prop → the accessible name of the control that edits it. Adding a block type
 *  means adding a line here; that is the point. */
const EDITABLE = {
  title: ["Title"],
  tagline: ["Tagline"],
  paragraph: ["Paragraph"],
  blockquote: ["Quote", "Quote attribution"],
  callout: ["Callout"],
  image: ["Image caption"],
  list: ["List item"],
  process: ["Step", "Step"],
  statCard: ["Stat value", "Stat label", "Stat caption"],
  table: ["heading", "Column"],
  pricingTable: ["name", "price", "feature"],
  chart: ["label", "value"],
};

for (const [type, labels] of Object.entries(EDITABLE)) {
  assert.ok(contentTypes.includes(type), `EDITABLE lists "${type}" but it is not a ContentType`);
  for (const label of labels) {
    assert.ok(
      renderContent.includes(label),
      `Block "${type}" should expose an editable control labelled with "${label}"`,
    );
  }
}

const missing = contentTypes.filter((type) => !(type in EDITABLE));
assert.equal(missing.length, 0,
  `These block types have no recorded editable fields: ${missing.join(", ")}. ` +
  "Add them to RenderContent and to EDITABLE in this script.");

/* --- 3. Repeatable collections can grow and shrink -------------------- */

const COLLECTIONS = ["Add item", "Add step", "Add row", "Add column", "Add tier", "Add feature", "Add data point"];
for (const label of COLLECTIONS) {
  assert.ok(renderContent.includes(`"${label}"`), `Missing an add control: "${label}"`);
}

// Every collection also needs a way back down.
const removeCount = (renderContent.match(/<RemoveEntry/g) ?? []).length;
assert.ok(removeCount >= 7, `expected a RemoveEntry per collection, found ${removeCount}`);

/* --- 4. Present/public output stays unaffected ------------------------ */

// Each collection branch must short-circuit when there is no editor, so
// published decks emit no editing affordances at all.
const guardCount = (renderContent.match(/if \(!editor\)/g) ?? []).length;
assert.ok(guardCount >= 6,
  `expected each complex block to bail out of edit rendering; found ${guardCount} guards`);

/* --- 5. Every editable control is named ------------------------------- */

// Attribute values contain arrow functions, so `[^>]` cannot delimit the tag.
// Scanning a fixed window after each opening tag is cruder and correct.
const inlineControls = [...renderContent.matchAll(/<Inline(?:String|Text|Number)\b/g)];
assert.ok(inlineControls.length >= 20, `expected many inline editors, found ${inlineControls.length}`);
for (const control of inlineControls) {
  const window = renderContent.slice(control.index, control.index + 320);
  assert.ok(
    /\blabel=/.test(window),
    `An inline editor is missing its accessible label:\n${window.slice(0, 160)}`,
  );
}

console.log(
  `Block editability OK: ${contentTypes.length} types, all with edit cases, ` +
  `${inlineControls.length} labelled inline editors, ${COLLECTIONS.length} growable collections.`,
);
