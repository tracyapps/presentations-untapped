import type { MediaAsset } from "@/lib/data/media";

export const MEDIA_DRAG_TYPE = "application/x-presentations-media";

export function hasMediaDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(MEDIA_DRAG_TYPE);
}

export function readMediaDrag(dataTransfer: DataTransfer): MediaAsset | null {
  const raw = dataTransfer.getData(MEDIA_DRAG_TYPE);
  if (!raw) return null;

  try {
    const asset = JSON.parse(raw) as Partial<MediaAsset>;
    if (typeof asset.url !== "string" || typeof asset.pathname !== "string" || typeof asset.name !== "string") return null;
    return {
      url: asset.url,
      pathname: asset.pathname,
      name: asset.name,
      size: typeof asset.size === "number" ? asset.size : 0,
      uploadedAt: typeof asset.uploadedAt === "string" ? asset.uploadedAt : new Date(0).toISOString(),
      contentType: typeof asset.contentType === "string" ? asset.contentType : undefined,
    };
  } catch {
    return null;
  }
}
