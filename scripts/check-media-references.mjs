import assert from "node:assert/strict";
import { countMediaReferences, replaceMediaUrl } from "../src/lib/media-references.ts";

const oldUrl = "https://blob.example/old-image.jpg";
const newUrl = "https://blob.example/renamed-image.jpg";
const doc = {
  version: 1,
  style: { backgroundImage: { src: oldUrl, position: "center" } },
  blocks: [
    { id: "root-image", kind: "content", type: "image", props: { src: oldUrl, alt: "Root" } },
    { id: "columns", kind: "layout", type: "columns", props: { cols: 2 }, children: [
      { id: "nested-image", kind: "content", type: "image", props: { src: oldUrl, alt: "Nested" } },
      { id: "other-image", kind: "content", type: "image", props: { src: "https://blob.example/other.jpg", alt: "Other" } },
    ] },
  ],
};

assert.equal(countMediaReferences(doc, oldUrl), 3, "background, root, and nested references should all be counted");
const replaced = replaceMediaUrl(doc, oldUrl, newUrl);
assert.equal(countMediaReferences(replaced, oldUrl), 0, "the old URL should be fully removed");
assert.equal(countMediaReferences(replaced, newUrl), 3, "every old reference should point at the renamed asset");
assert.equal(replaced.blocks[1].children[1].props.src, "https://blob.example/other.jpg", "unrelated media must remain unchanged");
assert.notEqual(replaced, doc, "a referenced document should be copied rather than mutated");
assert.equal(replaceMediaUrl(doc, "https://blob.example/missing.jpg", newUrl), doc, "an unrelated document should retain identity");

console.log("Media reference checks passed: nested images and slide backgrounds migrate safely.");
