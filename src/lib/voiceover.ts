import type { CaptionCue } from "@/lib/slides/types";

export type VoiceoverData = {
  id: string;
  audioUrl: string;
  mime: string;
  durationSec: number;
  cues: CaptionCue[];
  updatedAt: string;
};

export function validateCaptionCues(cues: CaptionCue[], durationSec: number): string[] {
  const errors: string[] = [];
  if (cues.length > 500) errors.push("A voiceover can contain at most 500 caption cues.");

  cues.forEach((cue, index) => {
    const label = `Cue ${index + 1}`;
    if (!Number.isFinite(cue.start) || cue.start < 0) errors.push(`${label} needs a valid start time.`);
    if (!Number.isFinite(cue.end) || cue.end <= cue.start) errors.push(`${label} must end after it starts.`);
    if (cue.end > durationSec + 0.25) errors.push(`${label} ends after the audio clip.`);
    if (!cue.text.trim()) errors.push(`${label} needs caption text.`);
    if (cue.text.length > 1000) errors.push(`${label} must be 1,000 characters or fewer.`);
    if (index > 0 && cue.start < cues[index - 1].end) errors.push(`${label} overlaps the previous cue.`);
  });

  return errors;
}
