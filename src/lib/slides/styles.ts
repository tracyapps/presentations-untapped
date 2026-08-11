import type { CSSProperties } from "react";
import registryJson from "./style-registry.json";

export type SurfaceKey = "neutral" | "warm" | "evergreen" | "orange";
export type PatternKey = "waves" | "blobs" | "bubbles";
export type ImageFrameKey =
  | "squircle" | "pebble" | "petal" | "splat" | "blob" | "logomark"
  | "detail-01" | "detail-02" | "detail-03" | "detail-03-original" | "detail-04" | "detail-05"
  | "horizontal-complex" | "horizontal-complex-original" | "horizontal-large"
  | "horizontal-large-inverse" | "horizontal-wide" | "round-bottom";

export type SurfaceChoice = "inherit" | SurfaceKey;
export type SlidePatternChoice = "none" | PatternKey;

type ColorSet = { background: string; foreground: string; muted: string; accent: string };
export type SurfaceDefinition = {
  key: SurfaceKey;
  label: string;
  description: string;
  light: ColorSet;
  dark: ColorSet;
};
export type PatternDefinition = {
  key: PatternKey;
  label: string;
  asset: string;
  foreground: string;
  muted: string;
  accent: string;
  scrim: string;
  scrimOpacity: number;
};
export type FrameDefinition = { key: ImageFrameKey; label: string; asset: string };

export const SURFACES = registryJson.surfaces as SurfaceDefinition[];
export const PATTERNS = registryJson.patterns as PatternDefinition[];
export const IMAGE_FRAMES = registryJson.frames as FrameDefinition[];

type StyleVariables = CSSProperties & Record<`--${string}`, string>;

function variables(colors: ColorSet): StyleVariables {
  return {
    "--surface-bg": colors.background,
    "--surface-fg": colors.foreground,
    "--surface-muted": colors.muted,
    "--surface-accent": colors.accent,
    "--bg-page": colors.background,
    "--bg-surface": colors.background,
    "--bg-surface-raised": colors.background,
    "--bg-accent-soft": colors.background,
    "--bg-teal-soft": colors.background,
    "--bg-blue-soft": colors.background,
    "--text-primary": colors.foreground,
    "--text-secondary": colors.muted,
    "--accent-primary": colors.accent,
    backgroundColor: colors.background,
    color: colors.foreground,
  };
}

export function surfaceStyle(surface: SurfaceChoice | undefined, theme: "light" | "dark"): StyleVariables | undefined {
  if (!surface || surface === "inherit") return undefined;
  const definition = SURFACES.find((item) => item.key === surface);
  return definition ? variables(definition[theme]) : undefined;
}

export function patternStyle(pattern: SlidePatternChoice | undefined): StyleVariables | undefined {
  if (!pattern || pattern === "none") return undefined;
  const definition = PATTERNS.find((item) => item.key === pattern);
  if (!definition) return undefined;
  const alpha = definition.scrimOpacity;
  const scrim = `rgb(0 0 0 / ${alpha})`;
  return {
    "--surface-fg": definition.foreground,
    "--surface-muted": definition.muted,
    "--surface-accent": definition.accent,
    "--text-primary": definition.foreground,
    "--text-secondary": definition.muted,
    "--accent-primary": definition.accent,
    "--bg-page": "#c04402",
    "--bg-surface": "rgb(0 0 0 / 0.28)",
    "--bg-surface-raised": "rgb(0 0 0 / 0.38)",
    "--bg-accent-soft": "rgb(0 0 0 / 0.28)",
    "--bg-teal-soft": "rgb(0 0 0 / 0.28)",
    "--bg-blue-soft": "rgb(0 0 0 / 0.28)",
    backgroundColor: "#c04402",
    backgroundImage: `linear-gradient(${scrim}, ${scrim}), url(${definition.asset})`,
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: "cover",
    color: definition.foreground,
  };
}

export function frameByKey(frame: ImageFrameKey | undefined): FrameDefinition | undefined {
  return IMAGE_FRAMES.find((item) => item.key === frame);
}
