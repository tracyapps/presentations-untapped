import { readFile } from "node:fs/promises";

const policy = JSON.parse(await readFile(new URL("../src/lib/media-policy.json", import.meta.url), "utf8"));
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
const expectedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

if (policy.prefix !== "media/") throw new Error("Media assets must stay isolated under the media/ Blob prefix.");
if (policy.maximumSizeInBytes !== 15 * 1024 * 1024) throw new Error("The media upload limit must remain 15 MB.");
if (JSON.stringify(policy.allowedContentTypes) !== JSON.stringify(expectedTypes)) {
  throw new Error("Media uploads must allow JPG, PNG, WebP, and GIF only.");
}
if (policy.allowedContentTypes.includes("image/svg+xml")) throw new Error("SVG uploads must remain disabled because they can contain active content.");
if (!packageJson.dependencies?.["@vercel/blob"]) throw new Error("@vercel/blob must be installed for media uploads.");
if (!/^BLOB_READ_WRITE_TOKEN=/m.test(envExample) || !/^media_READ_WRITE_TOKEN=/m.test(envExample)) {
  throw new Error(".env.example must document default and media-named Blob token variables.");
}

console.log("Media policy checks passed: public image formats, 15 MB limit, isolated Blob prefix, package, and env contract.");
