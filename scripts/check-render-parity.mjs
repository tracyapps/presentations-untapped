import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Guards edit/present render parity for floating images.
 *
 * The bug this exists to prevent: floating images are positioned with
 * percentages, and in edit mode every block is wrapped in a `position: relative`
 * element. An image inside a group therefore resolved its percentages against
 * the group in the editor and against the whole canvas in present mode — the
 * same document rendering as two very different slides, with the divergence
 * only visible by opening present mode and comparing by eye.
 *
 * The fix is structural: every float renders in one `.slide-float-layer` that is
 * always exactly the 16:9 box. These assertions keep it that way.
 */

const canvas = readFileSync(new URL("../src/components/SlideCanvas.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

/* --- 1. One layer, used by both modes --------------------------------- */

assert.ok(canvas.includes("splitFloating"), "floats must be hoisted out of the flow tree");
assert.ok(canvas.includes('className="slide-float-layer"'), "the float layer must be rendered");

// The layer is rendered once, outside the editor/present branch, so it cannot
// diverge between the two.
const layerRenders = (canvas.match(/className="slide-float-layer"/g) ?? []).length;
assert.equal(layerRenders, 1, `the float layer must be rendered exactly once, found ${layerRenders}`);

// Both branches consume the same stripped tree.
assert.ok(canvas.includes("nodes={flow}"), "edit mode must render the stripped flow tree");
assert.ok(canvas.includes("flow.map("), "present mode must render the same stripped flow tree");
assert.ok(!/doc\.blocks\.map\(/.test(canvas),
  "nothing may render doc.blocks directly — floats would render twice and in the wrong box");

/* --- 2. The layer is the 16:9 box ------------------------------------- */

const layerRule = css.match(/^\.slide-float-layer \{([^}]*)\}/m);
assert.ok(layerRule, ".slide-float-layer rule not found");
assert.ok(/position:\s*absolute/.test(layerRule[1]), "the float layer must be absolutely positioned");
assert.ok(/inset:\s*0/.test(layerRule[1]), "the float layer must cover the whole viewport box");
assert.ok(!/padding/.test(layerRule[1]),
  "the float layer must not have padding — it would shift every existing floating image");

/* --- 3. No hardcoded aspect ratio ------------------------------------- */

// A fixed ratio in CSS silently overrides the image's real one, which is how
// edit mode ended up showing differently-shaped images than present mode.
// Checked per-rule by selector rather than by slicing the file, so unrelated
// rules moving around cannot make this pass or fail by accident.
const floatRules = css.split("\n").filter((line) => /^\.[^{]*(float|floating)[^{]*\{/i.test(line));
assert.ok(floatRules.length > 0, "expected rules targeting the float layer");
const hardcodedRatio = floatRules.filter((line) => /aspect-ratio:\s*[\d.]/.test(line));
assert.equal(hardcodedRatio.length, 0,
  `no hardcoded aspect-ratio may apply to floating images:\n${hardcodedRatio.join("\n")}`);

/* --- 4. The old slot positioning is gone ------------------------------ */

assert.ok(!canvas.includes("is-floating-slot"),
  "the old per-slot float positioning must not come back");
assert.ok(!/\.dnd-node-slot\.is-floating-slot\s*\{/.test(css),
  "the old .dnd-node-slot.is-floating-slot rule must be removed");

/* --- 5. Drag math measures the layer, not the canvas ------------------ */

assert.ok(!canvas.includes('closest(".slide-canvas")'),
  "drag and resize must measure the float layer; the edit canvas grows with content");
const layerMeasures = (canvas.match(/closest\("\.slide-float-layer"\)/g) ?? []).length;
assert.ok(layerMeasures >= 2,
  `both move and resize must measure the float layer, found ${layerMeasures}`);

/* --- 6. Chrome must not displace the image ---------------------------- */

assert.ok(/\.editable-slide-block\.is-floating-image-block \{[^}]*padding-top:\s*0/.test(css),
  "the editor's block chrome must not push a floating image down by its own height");

/* --- 7. Slides scale to themselves, not the browser window ------------ */

// Slide type used to be sized in `rem` and `vw`, so it was pinned to the
// viewport: the same deck looked different in the editor and in present mode,
// and thumbnails came out with unreadable oversized text. The slide is a size
// container now and everything inside sizes from it.
const viewportRule = css.match(/^\.slide-viewport \{([\s\S]*?)^\}/m);
assert.ok(viewportRule, ".slide-viewport rule not found");
assert.ok(/container-type:\s*inline-size/.test(viewportRule[1]),
  ".slide-viewport must be a size container so slide content can size in cqw");
// The base font size must live on a CHILD of the container. Container units in
// a container's own styles resolve against an ancestor container and, with
// none, fall back to the small viewport — silently behaving like `vw`, which is
// the exact bug this was meant to fix.
assert.ok(!/font-size:\s*[\d.]+cq/.test(viewportRule[1]),
  ".slide-viewport must not size itself in container units — they resolve against an ancestor, not itself");
for (const selector of [".slide-canvas", ".slide-float-layer"]) {
  // Anchored: ".slide-nav-preview .slide-canvas {" contains ".slide-canvas {"
  // as a substring and would otherwise match first.
  const rule = css.match(new RegExp(`^\\${selector} \\{([^}]*)\\}`, "m"));
  assert.ok(rule && /font-size:\s*[\d.]+cqw/.test(rule[1]),
    `${selector} must set the cqw base font size so slide type scales with the slide`);
}

// No slide rule may reintroduce viewport units.
const slideRules = css.split("\n").filter((line) => /^\.slide-[a-z-]/.test(line));
const viewportUnitRules = slideRules.filter((line) => /\d(vw|vh|vmin|vmax)\b/.test(line));
assert.equal(viewportUnitRules.length, 0,
  `slide rules must not use viewport units:\n${viewportUnitRules.join("\n")}`);

/* --- 8. Authored line breaks survive into read-only renderers --------- */

// Breaks are stored in the text run; without pre-wrap they collapse everywhere
// except the contentEditable field, so text looked right while editing and
// wrong on screen.
for (const selector of [".slide-paragraph", ".slide-canvas blockquote"]) {
  const rule = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")} \\{([^}]*)\\}`));
  assert.ok(rule && /white-space:\s*pre-wrap/.test(rule[1]),
    `${selector} must use white-space: pre-wrap so authored line breaks survive`);
}
assert.ok(/\.slide-title, \.slide-tagline, \.slide-list li \{[^}]*white-space:\s*pre-wrap/.test(css),
  "titles, taglines, and list items must preserve authored line breaks too");

console.log(
  "Render parity OK: floats share one 16:9 layer, slides size in container units, " +
  "and line breaks survive into present.",
);
