import { list } from "@vercel/blob";
import policy from "@/lib/media-policy.json";
import { getMediaBlobToken } from "@/lib/media-storage";

export type MediaAsset = {
  url: string;
  pathname: string;
  name: string;
  size: number;
  uploadedAt: string;
  contentType?: string;
};

export type MediaLibraryData = {
  configured: boolean;
  items: MediaAsset[];
  error?: string;
};

function filename(pathname: string): string {
  const leaf = (pathname.split("/").at(-1) ?? pathname).replace(/^(?:[0-9a-f-]{36}--)+/i, "");
  try {
    return decodeURIComponent(leaf);
  } catch {
    return leaf;
  }
}

export async function getMediaLibrary(): Promise<MediaLibraryData> {
  const token = getMediaBlobToken();
  if (!token) return { configured: false, items: [] };

  try {
    const items: MediaAsset[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: policy.prefix, limit: 1000, cursor, token });
      items.push(...page.blobs.map((blob) => ({
        url: blob.url,
        pathname: blob.pathname,
        name: filename(blob.pathname),
        size: blob.size,
        uploadedAt: blob.uploadedAt.toISOString(),
      })));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    items.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    return { configured: true, items };
  } catch (error) {
    console.error("Failed to load Vercel Blob media", error);
    return { configured: true, items: [], error: "The media library could not be loaded. Check the Blob connection and token." };
  }
}
