"use server";

import { auth } from "@clerk/nextjs/server";
import { del, head } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { slides, voiceovers } from "@/lib/db/schema";
import { getMediaBlobToken } from "@/lib/media-storage";
import type { CaptionCue } from "@/lib/slides/types";
import audioPolicy from "@/lib/audio-policy.json";
import { validateCaptionCues, type VoiceoverData } from "@/lib/voiceover";

type VoiceoverActionResult =
  | { status: "saved"; voiceover: VoiceoverData }
  | { status: "complete"; message: string }
  | { status: "error"; message: string };

function managedAudioUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.pathname.startsWith(`/${audioPolicy.prefix}`) && !url.pathname.includes("..");
  } catch {
    return false;
  }
}

function captionCue(value: unknown): value is CaptionCue {
  if (!value || typeof value !== "object") return false;
  const cue = value as Record<string, unknown>;
  return typeof cue.start === "number" && typeof cue.end === "number" && typeof cue.text === "string";
}

async function slideVoiceover(deckId: string, slideId: string) {
  const [row] = await db.select({
    id: voiceovers.id,
    audioUrl: voiceovers.audioUrl,
    mime: voiceovers.mime,
    durationSec: voiceovers.durationSec,
    cues: voiceovers.cues,
    updatedAt: voiceovers.updatedAt,
  })
    .from(slides)
    .leftJoin(voiceovers, eq(slides.id, voiceovers.slideId))
    .where(and(eq(slides.id, slideId), eq(slides.deckId, deckId)))
    .limit(1);
  return row;
}

async function deleteManagedBlob(audioUrl: string): Promise<void> {
  const token = getMediaBlobToken();
  if (!token || !managedAudioUrl(audioUrl)) return;
  try {
    await del(audioUrl, { token });
  } catch (error) {
    console.error("Failed to delete replaced voiceover Blob", error);
  }
}

export async function saveVoiceoverAction(input: {
  deckId: string;
  slideId: string;
  audioUrl: string;
  mime: string;
  durationSec: number;
}): Promise<VoiceoverActionResult> {
  const { userId } = await auth();
  if (!userId) return { status: "error", message: "Your session expired. Sign in again to save the voiceover." };
  if (!managedAudioUrl(input.audioUrl)) return { status: "error", message: "The uploaded audio URL is invalid." };
  if (!audioPolicy.allowedContentTypes.includes(input.mime)) return { status: "error", message: "Choose an MP3, M4A, or WAV file." };
  if (!Number.isFinite(input.durationSec) || input.durationSec <= 0 || input.durationSec > 24 * 60 * 60) {
    return { status: "error", message: "The audio duration is invalid." };
  }

  const token = getMediaBlobToken();
  if (!token) return { status: "error", message: "Vercel Blob is not configured." };
  try {
    const blob = await head(input.audioUrl, { token });
    if (!blob.pathname.startsWith(audioPolicy.prefix)
      || blob.size > audioPolicy.maximumSizeInBytes
      || !audioPolicy.allowedContentTypes.includes(blob.contentType)) {
      return { status: "error", message: "The uploaded audio does not meet the voiceover policy." };
    }
  } catch (error) {
    console.error("Failed to verify uploaded voiceover Blob", error);
    return { status: "error", message: "The uploaded audio could not be verified." };
  }

  const current = await slideVoiceover(input.deckId, input.slideId);
  if (!current) return { status: "error", message: "This slide no longer exists." };

  const now = new Date();
  const [saved] = await db.insert(voiceovers).values({
    slideId: input.slideId,
    audioUrl: input.audioUrl,
    mime: input.mime,
    durationSec: input.durationSec,
    cues: [],
    updatedAt: now,
  }).onConflictDoUpdate({
    target: voiceovers.slideId,
    set: {
      audioUrl: input.audioUrl,
      mime: input.mime,
      durationSec: input.durationSec,
      cues: [],
      updatedAt: now,
    },
  }).returning();

  if (current.audioUrl && current.audioUrl !== saved.audioUrl) await deleteManagedBlob(current.audioUrl);
  revalidatePath(`/decks/${input.deckId}/edit`);
  return {
    status: "saved",
    voiceover: {
      id: saved.id,
      audioUrl: saved.audioUrl,
      mime: saved.mime,
      durationSec: saved.durationSec,
      cues: saved.cues,
      updatedAt: saved.updatedAt.toISOString(),
    },
  };
}

export async function saveCaptionCuesAction(input: {
  deckId: string;
  slideId: string;
  cues: CaptionCue[];
}): Promise<VoiceoverActionResult> {
  const { userId } = await auth();
  if (!userId) return { status: "error", message: "Your session expired. Sign in again to save captions." };
  if (!Array.isArray(input.cues) || !input.cues.every(captionCue)) {
    return { status: "error", message: "The caption data is invalid." };
  }

  const current = await slideVoiceover(input.deckId, input.slideId);
  if (!current?.id || current.durationSec === null) return { status: "error", message: "Upload a voiceover before adding captions." };
  const errors = validateCaptionCues(input.cues, current.durationSec);
  if (errors.length) return { status: "error", message: errors[0] };

  const now = new Date();
  const [saved] = await db.update(voiceovers)
    .set({ cues: input.cues, updatedAt: now })
    .where(eq(voiceovers.id, current.id))
    .returning();
  if (!saved) return { status: "error", message: "The voiceover no longer exists." };

  revalidatePath(`/decks/${input.deckId}/edit`);
  return {
    status: "saved",
    voiceover: {
      id: saved.id,
      audioUrl: saved.audioUrl,
      mime: saved.mime,
      durationSec: saved.durationSec,
      cues: saved.cues,
      updatedAt: saved.updatedAt.toISOString(),
    },
  };
}

export async function deleteVoiceoverAction(input: {
  deckId: string;
  slideId: string;
}): Promise<VoiceoverActionResult> {
  const { userId } = await auth();
  if (!userId) return { status: "error", message: "Your session expired. Sign in again to delete the voiceover." };

  const current = await slideVoiceover(input.deckId, input.slideId);
  if (!current) return { status: "error", message: "This slide no longer exists." };
  if (!current.id || !current.audioUrl) return { status: "complete", message: "This slide has no voiceover." };

  await db.delete(voiceovers).where(eq(voiceovers.id, current.id));
  await deleteManagedBlob(current.audioUrl);
  revalidatePath(`/decks/${input.deckId}/edit`);
  return { status: "complete", message: "Voiceover deleted." };
}
