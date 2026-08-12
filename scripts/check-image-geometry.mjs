import assert from "node:assert/strict";
import {
  alignFloatingImage,
  clampFloatingImage,
  imageHeightPercent,
  normalizeRotation,
  positionFloatingImage,
  snapFloatingPosition,
  snapRotation,
} from "../src/lib/image-geometry.ts";

const clamped = clampFloatingImage({
  src: "image.jpg",
  alt: "Example",
  placement: "floating",
  x: 99,
  y: -20,
  width: 40,
  aspectRatio: 4 / 3,
  rotation: 541,
  focalX: 110,
  focalY: -5,
});
assert.equal(clamped.x, 60, "a floating image must remain within the slide's right edge");
assert.equal(clamped.y, 0, "a floating image must remain within the slide's top edge");
assert.equal(clamped.rotation, -179, "rotation should wrap into a stable signed range");
assert.equal(clamped.focalX, 100, "focal X should be clamped to the image bounds");
assert.equal(clamped.focalY, 0, "focal Y should be clamped to the image bounds");
assert.equal(imageHeightPercent(40, 4 / 3), 160 / 3, "4:3 image height should account for a 16:9 slide");

const snapped = snapFloatingPosition({ src: "image.jpg", alt: "Example", placement: "floating", x: 29.6, y: 22.9, width: 40, aspectRatio: 4 / 3 });
assert.equal(snapped.x, 30, "nearby horizontal centers should snap");
assert.equal(snapped.y, (100 - imageHeightPercent(40, 4 / 3)) / 2, "nearby vertical centers should snap");
const freelyPositioned = positionFloatingImage({ src: "image.jpg", alt: "Example", placement: "floating", x: 29.6, y: 22.9, width: 40, aspectRatio: 4 / 3 });
assert.equal(freelyPositioned.x, 29.6, "free dragging should preserve an arbitrary horizontal position");
assert.equal(freelyPositioned.y, 22.9, "free dragging should preserve an arbitrary vertical position");
assert.equal(positionFloatingImage(freelyPositioned, true).x, 30, "explicit guide snapping should still be available");

assert.equal(alignFloatingImage(clamped, "right").x, 60, "right alignment should use the image width");
assert.equal(alignFloatingImage(clamped, "bottom").y, 100 - imageHeightPercent(40, 4 / 3), "bottom alignment should use proportional image height");
assert.equal(snapRotation(87), 90, "rotation should snap near 45 degree increments");
assert.equal(normalizeRotation(-540), -180, "negative rotation should wrap consistently");

console.log("Image geometry checks passed: bounds, proportional sizing, snapping, alignment, focal point, and rotation are stable.");
