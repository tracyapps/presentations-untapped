import type { CaptionCue } from "@/lib/slides/types";

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function splitScriptIntoCaptions(script: string, targetLength = 70): string[] {
  const text = normalize(script);
  if (!text) return [];

  const sentences = text.match(/[^.!?]+(?:[.!?]+|$)/g)?.map(normalize).filter(Boolean) ?? [text];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (sentence.length > targetLength * 1.7) {
      if (current) { chunks.push(current); current = ""; }
      const words = sentence.split(" ");
      let fragment = "";
      for (const word of words) {
        if (fragment && `${fragment} ${word}`.length > targetLength) {
          chunks.push(fragment);
          fragment = word;
        } else {
          fragment = fragment ? `${fragment} ${word}` : word;
        }
      }
      if (fragment) current = fragment;
      continue;
    }

    const combined = current ? `${current} ${sentence}` : sentence;
    if (current && combined.length > targetLength * 1.25) {
      chunks.push(current);
      current = sentence;
    } else {
      current = combined;
    }
  }
  if (current) chunks.push(current);
  return chunks.slice(0, 500);
}

export function findPauseBoundaries(channels: Float32Array[], sampleRate: number): number[] {
  if (!channels.length || !channels[0]?.length || sampleRate <= 0) return [];
  const windowSize = Math.max(1, Math.floor(sampleRate * 0.04));
  const rms: number[] = [];

  for (let offset = 0; offset < channels[0].length; offset += windowSize) {
    let sum = 0;
    let count = 0;
    const end = Math.min(channels[0].length, offset + windowSize);
    const sampleStep = 4;
    for (let index = offset; index < end; index += sampleStep) {
      for (const channel of channels) {
        const value = channel[index] ?? 0;
        sum += value * value;
        count += 1;
      }
    }
    rms.push(Math.sqrt(sum / Math.max(1, count)));
  }

  const sorted = [...rms].sort((a, b) => a - b);
  const percentile = (ratio: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
  const floor = percentile(0.2);
  const speech = percentile(0.9);
  const threshold = Math.max(0.003, floor + (speech - floor) * 0.16);
  const minimumSilentWindows = Math.max(4, Math.ceil(0.2 / (windowSize / sampleRate)));
  const boundaries: number[] = [];
  let silentStart = -1;

  for (let index = 0; index <= rms.length; index += 1) {
    const silent = index < rms.length && rms[index] <= threshold;
    if (silent && silentStart < 0) silentStart = index;
    if (!silent && silentStart >= 0) {
      const length = index - silentStart;
      if (length >= minimumSilentWindows) {
        const midpoint = ((silentStart + index) / 2) * windowSize / sampleRate;
        const duration = channels[0].length / sampleRate;
        if (midpoint > 0.15 && midpoint < duration - 0.15) boundaries.push(midpoint);
      }
      silentStart = -1;
    }
  }
  return boundaries;
}

function roundHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}

export function timeCaptionScript(script: string, durationSec: number, pauseBoundaries: number[] = []): CaptionCue[] {
  const captions = splitScriptIntoCaptions(script);
  if (!captions.length || !Number.isFinite(durationSec) || durationSec <= 0) return [];
  if (captions.length === 1) return [{ start: 0, end: roundHundredth(durationSec), text: captions[0] }];

  const totalWeight = captions.reduce((sum, caption) => sum + Math.max(1, caption.length), 0);
  const averageSpan = durationSec / captions.length;
  const pauses = pauseBoundaries.filter((value) => value > 0 && value < durationSec).sort((a, b) => a - b);
  const boundaries: number[] = [];
  let cumulativeWeight = 0;

  for (let index = 0; index < captions.length - 1; index += 1) {
    cumulativeWeight += Math.max(1, captions[index].length);
    const desired = durationSec * cumulativeWeight / totalWeight;
    const previous = boundaries.at(-1) ?? 0;
    const minimum = previous + Math.min(0.12, averageSpan * 0.2);
    const remaining = captions.length - index - 1;
    const maximum = durationSec - remaining * Math.min(0.12, averageSpan * 0.2);
    const nearby = pauses
      .filter((pause) => pause > minimum && pause < maximum)
      .sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired))[0];
    const tolerance = Math.max(0.75, averageSpan * 0.7);
    boundaries.push(Math.min(maximum, Math.max(minimum, nearby !== undefined && Math.abs(nearby - desired) <= tolerance ? nearby : desired)));
  }

  return captions.map((text, index) => {
    const start = index === 0 ? 0 : boundaries[index - 1];
    const next = index === captions.length - 1 ? durationSec : boundaries[index];
    const gap = index === captions.length - 1 ? 0 : Math.min(0.08, Math.max(0, (next - start) * 0.08));
    return { start: roundHundredth(start), end: roundHundredth(Math.max(start + 0.01, next - gap)), text };
  });
}
