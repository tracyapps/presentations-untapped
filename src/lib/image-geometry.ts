import type { ContentProps } from "./slides/types";

export type ImageAlignment = "left" | "center-x" | "right" | "top" | "center-y" | "bottom";

export const IMAGE_MIN_WIDTH = 12;
export const IMAGE_MAX_WIDTH = 100;
export const IMAGE_DEFAULT_ASPECT_RATIO = 4 / 3;
const SLIDE_ASPECT_RATIO = 16 / 9;
const SNAP_THRESHOLD = 1.5;

function finite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function imageAspectRatio(value?: number): number {
  return clamp(finite(value, IMAGE_DEFAULT_ASPECT_RATIO), 0.25, 4);
}

export function imageHeightPercent(width: number, aspectRatio?: number): number {
  return width * SLIDE_ASPECT_RATIO / imageAspectRatio(aspectRatio);
}

export function normalizeRotation(value?: number): number {
  const rotation = finite(value, 0);
  return ((rotation + 180) % 360 + 360) % 360 - 180;
}

export function snapRotation(value: number, threshold = 4): number {
  const normalized = normalizeRotation(value);
  const nearest = Math.round(normalized / 45) * 45;
  return Math.abs(normalized - nearest) <= threshold ? normalizeRotation(nearest) : normalized;
}

export function clampFloatingImage(props: ContentProps["image"]): ContentProps["image"] {
  const aspectRatio = imageAspectRatio(props.aspectRatio);
  const maxWidthForHeight = 100 * aspectRatio / SLIDE_ASPECT_RATIO;
  const width = clamp(finite(props.width, 30), IMAGE_MIN_WIDTH, Math.min(IMAGE_MAX_WIDTH, maxWidthForHeight));
  const height = imageHeightPercent(width, aspectRatio);
  return {
    ...props,
    placement: "floating",
    x: clamp(finite(props.x, 60), 0, Math.max(0, 100 - width)),
    y: clamp(finite(props.y, 18), 0, Math.max(0, 100 - height)),
    width,
    aspectRatio,
    rotation: normalizeRotation(props.rotation),
    fit: props.fit === "contain" ? "contain" : "cover",
    focalX: clamp(finite(props.focalX, 50), 0, 100),
    focalY: clamp(finite(props.focalY, 50), 0, 100),
  };
}

function snap(value: number, anchors: number[], threshold = SNAP_THRESHOLD): number {
  const nearest = anchors.reduce((best, anchor) => Math.abs(anchor - value) < Math.abs(best - value) ? anchor : best, anchors[0]);
  return Math.abs(nearest - value) <= threshold ? nearest : value;
}

export function snapFloatingPosition(props: ContentProps["image"]): ContentProps["image"] {
  const normalized = clampFloatingImage(props);
  const width = normalized.width ?? 30;
  const height = imageHeightPercent(width, normalized.aspectRatio);
  return clampFloatingImage({
    ...normalized,
    x: snap(normalized.x ?? 0, [0, (100 - width) / 2, 100 - width]),
    y: snap(normalized.y ?? 0, [0, (100 - height) / 2, 100 - height]),
  });
}

export function positionFloatingImage(props: ContentProps["image"], snapToGuides = false): ContentProps["image"] {
  return snapToGuides ? snapFloatingPosition(props) : clampFloatingImage(props);
}

export function alignFloatingImage(props: ContentProps["image"], alignment: ImageAlignment): ContentProps["image"] {
  const normalized = clampFloatingImage(props);
  const width = normalized.width ?? 30;
  const height = imageHeightPercent(width, normalized.aspectRatio);
  if (alignment === "left") return { ...normalized, x: 0 };
  if (alignment === "center-x") return { ...normalized, x: (100 - width) / 2 };
  if (alignment === "right") return { ...normalized, x: 100 - width };
  if (alignment === "top") return { ...normalized, y: 0 };
  if (alignment === "center-y") return { ...normalized, y: (100 - height) / 2 };
  return { ...normalized, y: 100 - height };
}
