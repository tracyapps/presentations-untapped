import { readFile } from "node:fs/promises";

const policy = JSON.parse(await readFile(new URL("../src/lib/audio-policy.json", import.meta.url), "utf8"));
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
const expectedTypes = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav"];

if (policy.prefix !== "audio/") throw new Error("Voiceovers must stay isolated under the audio/ Blob prefix.");
if (policy.maximumSizeInBytes !== 25 * 1024 * 1024) throw new Error("The voiceover upload limit must remain 25 MB.");
if (JSON.stringify(policy.allowedContentTypes) !== JSON.stringify(expectedTypes)) {
  throw new Error("Voiceovers must allow MP3, M4A, and WAV MIME variants only.");
}
if (!packageJson.dependencies?.["@vercel/blob"]) throw new Error("@vercel/blob must be installed for voiceover uploads.");
if (!/^BLOB_READ_WRITE_TOKEN=/m.test(envExample) || !/^media_READ_WRITE_TOKEN=/m.test(envExample)) {
  throw new Error(".env.example must document the Blob token variables used by voiceovers.");
}

console.log("Audio policy checks passed: MP3/M4A/WAV formats, 25 MB limit, isolated Blob prefix, package, and env contract.");
