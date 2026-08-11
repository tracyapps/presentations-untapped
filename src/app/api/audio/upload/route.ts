import { auth } from "@clerk/nextjs/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import policy from "@/lib/audio-policy.json";
import { getMediaBlobToken } from "@/lib/media-storage";

export async function POST(request: Request): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to upload audio." }, { status: 401 });
  const token = getMediaBlobToken();
  if (!token) return NextResponse.json({ error: "Vercel Blob is not configured." }, { status: 503 });

  try {
    const body = await request.json() as HandleUploadBody;
    const response = await handleUpload({
      token,
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(policy.prefix) || pathname.includes("..")) throw new Error("Invalid audio pathname.");
        return {
          allowedContentTypes: policy.allowedContentTypes,
          maximumSizeInBytes: policy.maximumSizeInBytes,
          addRandomSuffix: false,
          allowOverwrite: false,
          cacheControlMaxAge: 60 * 60 * 24 * 30,
          tokenPayload: JSON.stringify({ uploadedBy: userId }),
        };
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to authorize audio upload", error);
    return NextResponse.json({ error: "The audio upload could not be authorized." }, { status: 400 });
  }
}
