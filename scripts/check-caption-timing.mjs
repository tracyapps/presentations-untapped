import assert from "node:assert/strict";
import { findPauseBoundaries, splitScriptIntoCaptions, timeCaptionScript } from "../src/lib/caption-timing.ts";

const script = "First, introduce the opportunity. Then explain how the program works. Finally, show the expected outcome.";
const chunks = splitScriptIntoCaptions(script);
assert.ok(chunks.length >= 2, "a full script should split into readable caption chunks");

const sampleRate = 1000;
const samples = new Float32Array(6000);
for (let index = 0; index < samples.length; index += 1) {
  const speaking = (index < 1800) || (index > 2300 && index < 3800) || index > 4300;
  samples[index] = speaking ? Math.sin(index / 7) * 0.35 : 0.0005;
}
const pauses = findPauseBoundaries([samples], sampleRate);
assert.equal(pauses.length, 2, "two material waveform pauses should be detected");
assert.ok(Math.abs(pauses[0] - 2.05) < 0.2, "the first pause should be centered near 2.05 seconds");

const cues = timeCaptionScript(script, 6, pauses);
assert.equal(cues.length, chunks.length);
assert.equal(cues[0].start, 0);
assert.equal(cues.at(-1).end, 6);
assert.ok(cues.every((cue, index) => cue.end > cue.start && (index === 0 || cue.start >= cues[index - 1].end)), "cues should be ordered and non-overlapping");

console.log(`Caption timing policy OK: ${cues.length} cues aligned to ${pauses.length} waveform pauses.`);
