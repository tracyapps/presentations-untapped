import { auth } from "@clerk/nextjs/server";
import { del } from "@vercel/blob";
import { NextResponse } from "next/server";
import policy from "@/lib/media-policy.json";
import { getMediaBlobToken } from "@/lib/media-storage";

export async function DELETE(request: Request): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to delete media." }, { status: 401 });

  const token = getMediaBlobToken();
  if (!token) return NextResponse.json({ error: "Vercel Blob is not configured." }, { status: 503 });

  try {
    const body = await request.json() as { pathname?: unknown };
    const pathname = typeof body.pathname === "string" ? body.pathname : "";
    if (!pathname.startsWith(policy.prefix) || pathname.includes("..")) {
      return NextResponse.json({ error: "Invalid media pathname." }, { status: 400 });
    }

    await del(pathname, { token });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Failed to delete media", error);
    return NextResponse.json({ error: "The image could not be deleted." }, { status: 500 });
  }
}
