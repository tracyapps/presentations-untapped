import { readFile, stat } from "node:fs/promises";

const registryUrl = new URL("../src/lib/slides/style-registry.json", import.meta.url);
const publicUrl = new URL("../public/", import.meta.url);
const registry = JSON.parse(await readFile(registryUrl, "utf8"));
const minimumContrast = 4.5;

function rgb(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Invalid six-digit hex color: ${hex}`);
  return hex.slice(1).match(/../g).map((value) => Number.parseInt(value, 16));
}

function luminance(hex) {
  const [red, green, blue] = rgb(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function composite(background, overlay, opacity) {
  const backgroundRgb = rgb(background);
  const overlayRgb = rgb(overlay);
  const mixed = backgroundRgb.map((channel, index) => Math.round(overlayRgb[index] * opacity + channel * (1 - opacity)));
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function assertContrast(label, foreground, background) {
  const ratio = contrast(foreground, background);
  if (ratio < minimumContrast) throw new Error(`${label} contrast ${ratio.toFixed(2)}:1 is below ${minimumContrast}:1`);
}

function assertUnique(items, kind) {
  const keys = items.map((item) => item.key);
  if (new Set(keys).size !== keys.length) throw new Error(`${kind} keys must be unique.`);
}

async function assertAsset(asset) {
  if (!asset.startsWith("/")) throw new Error(`Asset paths must be root-relative: ${asset}`);
  const assetUrl = new URL(`.${asset}`, publicUrl);
  await stat(assetUrl);
  return assetUrl;
}

assertUnique(registry.surfaces, "Surface");
assertUnique(registry.patterns, "Pattern");
assertUnique(registry.frames, "Frame");

let checkedPairs = 0;
for (const surface of registry.surfaces) {
  for (const mode of ["light", "dark"]) {
    const colors = surface[mode];
    for (const role of ["foreground", "muted", "accent"]) {
      assertContrast(`${surface.key}/${mode}/${role}`, colors[role], colors.background);
      checkedPairs += 1;
    }
  }
}

for (const pattern of registry.patterns) {
  const assetUrl = await assertAsset(pattern.asset);
  const artwork = await readFile(assetUrl, "utf8");
  const artworkColors = [...new Set(artwork.match(/#[0-9a-f]{6}/gi)?.map((color) => color.toLowerCase()) ?? [])];
  if (!artworkColors.length) throw new Error(`${pattern.key} must contain at least one six-digit SVG color.`);
  for (const artworkColor of artworkColors) {
    const renderedBackground = composite(artworkColor, pattern.scrim, pattern.scrimOpacity);
    for (const role of ["foreground", "muted", "accent"]) {
      assertContrast(`${pattern.key}/${artworkColor}/${role}`, pattern[role], renderedBackground);
      checkedPairs += 1;
    }
  }
}

for (const frame of registry.frames) await assertAsset(frame.asset);

console.log(`Slide style checks passed: ${checkedPairs} readable color pairs, ${registry.patterns.length} SVG themes, ${registry.frames.length} image masks.`);
