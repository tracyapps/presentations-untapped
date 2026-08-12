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
const floatCss = css.slice(css.indexOf(".slide-float-layer"));
const floatBlock = floatCss.slice(0, floatCss.indexOf("\n\n\n") + 1 || 2000);
assert.ok(!/aspect-ratio:\s*\d/.test(floatBlock),
  "no hardcoded aspect-ratio may apply to floating images — the node's own ratio must win");

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

console.log("Render parity OK: floats share one 16:9 layer across edit and present.");
