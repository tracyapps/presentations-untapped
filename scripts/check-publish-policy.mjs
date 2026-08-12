import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findPublishIssues, describeIssues } from "../src/lib/publish.ts";

/**
 * Guards the publishing boundary (PLAN.md §5.7, §8.3).
 *
 * Two failure modes this is here to catch, both of which are silent:
 *   1. A wrong Clerk matcher makes published decks demand a login — or worse,
 *      leaves the editor open to anyone.
 *   2. A deck that is not approved, or was un-published, still being served.
 */

const middleware = readFileSync(new URL("../src/middleware.ts", import.meta.url), "utf8");
const editorData = readFileSync(new URL("../src/lib/data/editor.ts", import.meta.url), "utf8");
const publicPage = readFileSync(new URL("../src/app/p/[client]/[deck]/page.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("../src/app/decks/publish-actions.ts", import.meta.url), "utf8");

/* --- 1. Route protection, both directions ----------------------------- */

const matcher = middleware.match(/createRouteMatcher\(\[([^\]]*)\]\)/);
assert.ok(matcher, "public route matcher not found");
assert.ok(/"\/p\(\.\*\)"/.test(matcher[1]), "/p/** must be public — published decks are viewed logged out");
assert.ok(/"\/sign-in\(\.\*\)"/.test(matcher[1]), "the sign-in screen must be public");
// The inverse matters just as much: everything else has to be protected.
assert.ok(/if \(!isPublicRoute\(req\)\) await auth\.protect\(\)/.test(middleware),
  "every non-public route must call auth.protect()");
assert.ok(!/"\/decks/.test(matcher[1]) && !/"\/library/.test(matcher[1]),
  "the editor and library must never be listed as public routes");

/* --- 2. Only approved AND published decks are served ------------------ */

const query = editorData.slice(editorData.indexOf("export async function getPublishedDeck"));
assert.ok(/eq\(decks\.status, "approved"\)/.test(query),
  "the public query must require an approved deck");
assert.ok(/isNotNull\(decks\.publishedAt\)/.test(query),
  "the public query must require published_at — un-approving clears it");
assert.ok(/eq\(clients\.slug, clientSlug\)/.test(query) && /eq\(decks\.slug, deckSlug\)/.test(query),
  "the public query must match on both slugs");
assert.ok(/if \(!deck\) notFound\(\)/.test(publicPage),
  "the public page must 404 rather than render anything for a missing deck");

/* --- 3. Un-publishing actually un-publishes --------------------------- */

assert.ok(/publishedAt: approving \? new Date\(\) : null/.test(actions),
  "moving out of approved must clear published_at, or the deck stays live");

/* --- 4. Published decks are never indexed ----------------------------- */

assert.ok(/robots:\s*\{[^}]*index:\s*false/.test(publicPage),
  "published decks must be noindex — they are for the client, not for Google");
assert.ok(/openGraph:/.test(publicPage), "published decks need OG tags for email link previews");

/* --- 5. Pre-publish checks ------------------------------------------- */

const context = { company: { name: "barTaco" }, deck: { title: "Proposal" } };

const clean = findPublishIssues([{
  position: 1,
  blocks: { version: 1, blocks: [
    { id: "a", kind: "content", type: "title", props: { text: [{ text: "For {{company.name}}" }] } },
    { id: "b", kind: "content", type: "image", props: { src: "https://x/y.jpg", alt: "A taco" } },
  ] },
}], context);
assert.equal(clean.length, 0, `a complete slide should raise nothing, got: ${describeIssues(clean)}`);

const dirty = findPublishIssues([{
  position: 3,
  blocks: { version: 1, blocks: [
    // event.name has no value in this context — this is the "Hi {{company.name}}
    // reaches a client" case, and it is the one that really matters.
    { id: "a", kind: "content", type: "paragraph", props: { text: [{ text: "See you at {{event.name}}" }] } },
    { id: "b", kind: "content", type: "image", props: { src: "https://x/y.jpg", alt: "  " } },
    { id: "c", kind: "content", type: "image", props: { src: "", alt: "" } },
  ] },
}], context);

const kinds = dirty.map((issue) => issue.kind);
assert.ok(kinds.includes("variable"), "an unresolved variable must be reported");
assert.ok(kinds.includes("alt-text"), "a blank alt text must be reported");
assert.ok(kinds.includes("empty-image"), "an image with no source must be reported");
assert.ok(dirty.every((issue) => issue.slidePosition === 3), "issues must name the slide they are on");

// A decorative image is a deliberate choice, not a missing alt.
const decorative = findPublishIssues([{
  position: 1,
  blocks: { version: 1, blocks: [
    { id: "a", kind: "content", type: "image", props: { src: "https://x/y.jpg", alt: "", decorative: true } },
  ] },
}], context);
assert.equal(decorative.length, 0, "a decorative image must not be flagged for missing alt text");

// Nested blocks are walked, and repeats collapse to one line per slide.
const nested = findPublishIssues([{
  position: 2,
  blocks: { version: 1, blocks: [
    { id: "g", kind: "layout", type: "group", props: {}, children: [
      { id: "x", kind: "content", type: "title", props: { text: [{ text: "{{event.name}}" }] } },
      { id: "y", kind: "content", type: "tagline", props: { text: [{ text: "{{event.name}}" }] } },
    ] },
  ] },
}], context);
assert.equal(nested.length, 1, "the same problem twice on one slide is one thing to fix, not two");
assert.ok(describeIssues(nested).startsWith("Slide 2:"));

console.log(
  `Publish policy OK: /p/** public and everything else protected, approved+published required, ` +
  `noindex set, ${dirty.length} issue kinds detected.`,
);
