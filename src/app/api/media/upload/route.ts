import { auth } from "@clerk/nextjs/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import policy from "@/lib/media-policy.json";

export async function POST(request: Request): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to upload media." }, { status: 401 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Vercel Blob is not configured." }, { status: 503 });
  }

  try {
    const body = await request.json() as HandleUploadBody;
    const response = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(policy.prefix) || pathname.includes("..")) throw new Error("Invalid media pathname.");
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
    console.error("Failed to authorize media upload", error);
    return NextResponse.json({ error: "The image upload could not be authorized." }, { status: 400 });
  }
}
