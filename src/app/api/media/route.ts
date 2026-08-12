import { auth } from "@clerk/nextjs/server";
import { copy, del, head } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { slides } from "@/lib/db/schema";
import { countMediaReferences, replaceMediaUrl } from "@/lib/media-references";
import policy from "@/lib/media-policy.json";
import { getMediaBlobToken } from "@/lib/media-storage";

function validPathname(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(policy.prefix) && !value.includes("..");
}

function safeBaseName(value: string): string {
  return value.normalize("NFKD").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 90).replace(/^[._-]+|[._-]+$/g, "");
}

function extension(pathname: string): string {
  const match = pathname.match(/(\.[a-z0-9]{2,5})$/i);
  return match?.[1].toLowerCase() ?? "";
}

async function referencedSlides(url: string) {
  const rows = await db.select({ id: slides.id, position: slides.position, blocks: slides.blocks }).from(slides);
  return rows.flatMap((slide) => {
    const references = countMediaReferences(slide.blocks, url);
    return references ? [{ ...slide, references }] : [];
  });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to rename media." }, { status: 401 });

  const token = getMediaBlobToken();
  if (!token) return NextResponse.json({ error: "Vercel Blob is not configured." }, { status: 503 });

  try {
    const body = await request.json() as { pathname?: unknown; name?: unknown };
    if (!validPathname(body.pathname)) return NextResponse.json({ error: "Invalid media pathname." }, { status: 400 });
    const baseName = typeof body.name === "string" ? safeBaseName(body.name.trim()) : "";
    if (!baseName) return NextResponse.json({ error: "Give this image a name." }, { status: 400 });

    const source = await head(body.pathname, { token });
    const suffix = extension(source.pathname);
    const finalName = `${baseName}${suffix}`;
    const nextPathname = `${policy.prefix}${crypto.randomUUID()}--${finalName}`;
    const copied = await copy(source.pathname, nextPathname, {
      access: "public",
      addRandomSuffix: false,
      contentType: source.contentType,
      token,
    });

    const affected = await referencedSlides(source.url);
    const now = new Date();
    try {
      await Promise.all(affected.map((slide) => db.update(slides).set({
        blocks: replaceMediaUrl(slide.blocks, source.url, copied.url),
        updatedAt: now,
      }).where(eq(slides.id, slide.id))));
    } catch (error) {
      // Keep both Blobs if reference migration is interrupted. Every slide URL
      // remains valid, and retrying the rename is safe.
      console.error("Failed to migrate renamed media references", error);
      return NextResponse.json({ error: "The image was copied, but its slide references could not all be updated. Nothing was removed; reload and try again." }, { status: 500 });
    }

    let cleanupWarning: string | undefined;
    try {
      await del(source.pathname, { token });
    } catch (error) {
      console.error("Failed to remove original media after rename", error);
      cleanupWarning = "The image was renamed, but the original file could not be removed from storage.";
    }

    return NextResponse.json({
      asset: {
        url: copied.url,
        pathname: copied.pathname,
        name: finalName,
        size: source.size,
        uploadedAt: source.uploadedAt.toISOString(),
        contentType: copied.contentType,
      },
      referencesUpdated: affected.reduce((total, slide) => total + slide.references, 0),
      slideVersions: affected.map((slide) => ({ id: slide.id, updatedAt: now.toISOString() })),
      warning: cleanupWarning,
    });
  } catch (error) {
    console.error("Failed to rename media", error);
    return NextResponse.json({ error: "The image could not be renamed." }, { status: 500 });
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to delete media." }, { status: 401 });

  const token = getMediaBlobToken();
  if (!token) return NextResponse.json({ error: "Vercel Blob is not configured." }, { status: 503 });

  try {
    const body = await request.json() as { pathname?: unknown; force?: unknown };
    if (!validPathname(body.pathname)) return NextResponse.json({ error: "Invalid media pathname." }, { status: 400 });

    const source = await head(body.pathname, { token });
    const affected = await referencedSlides(source.url);
    const referenceCount = affected.reduce((total, slide) => total + slide.references, 0);
    if (referenceCount && body.force !== true) {
      return NextResponse.json({
        error: "This image is still used by slides.",
        requiresForce: true,
        referenceCount,
        slideCount: affected.length,
        slidePositions: affected.map((slide) => slide.position).sort((a, b) => a - b),
      }, { status: 409 });
    }

    await del(body.pathname, { token });
    return NextResponse.json({ deleted: true, referenceCount });
  } catch (error) {
    console.error("Failed to delete media", error);
    return NextResponse.json({ error: "The image could not be deleted." }, { status: 500 });
  }
}
