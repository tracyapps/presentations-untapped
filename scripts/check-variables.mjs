import assert from "node:assert/strict";
import {
  BUILT_IN_VARIABLES, findUnresolved, rawText, resolveRichText, resolveString,
} from "../src/lib/variables.ts";

const ctx = {
  company: {
    name: "barTaco",
    industry: "Hospitality",
    contact: { primary: { name: "Dana Reyes", email: "dana@bartaco.com" } },
  },
  event: { name: "Catalina Nights" },
  deck: { title: "Loyalty proposal" },
  today: new Date("2026-08-12T12:00:00Z"),
};

/* --- registry ------------------------------------------------------- */

const keys = BUILT_IN_VARIABLES.map((v) => v.key);
assert.equal(new Set(keys).size, keys.length, "built-in variable keys must be unique");
assert.ok(keys.includes("company.name") && keys.includes("event.name"), "the core built-ins must exist");

/* --- string resolution ---------------------------------------------- */

assert.equal(
  resolveString("A proposal for {{company.name}} at {{event.name}}", ctx),
  "A proposal for barTaco at Catalina Nights",
);
assert.equal(resolveString("Hi {{ company.contact.primary.name }}", ctx), "Hi Dana Reyes");
assert.equal(resolveString("Dated {{today}}", ctx), "Dated August 12, 2026");
assert.equal(resolveString("No variables here", ctx), "No variables here");

/* --- fallbacks: never raw braces, never empty ------------------------ */

const bare = {};
assert.equal(resolveString("Hi {{company.name}}", bare), "Hi your company",
  "a missing value with a defaultValue uses the default");
assert.equal(resolveString("Visit {{company.website}}", bare), "Visit Company website",
  "a missing value with no default falls back to the human label");
assert.ok(!resolveString("{{company.website}} {{nope.key}}", bare).includes("{{"),
  "raw braces must never survive resolution");
assert.equal(resolveString("{{nope.key}}", bare), "nope.key",
  "an unknown key falls back to the key itself, not an empty string");
assert.equal(resolveString("Hi {{company.name}}", { defaults: { "company.name": "friend" } }), "Hi friend",
  "context defaults override the built-in default");

/* --- empty-string values count as unresolved ------------------------- */

assert.equal(resolveString("Hi {{company.name}}", { company: { name: "   " } }), "Hi your company",
  "a whitespace-only value is treated as missing");

/* --- rich text: marks preserved, spans split ------------------------- */

const rich = [
  { text: "Built for ", bold: true },
  { text: "{{company.name}} in {{company.industry}}", bold: true },
  { text: ".", italic: true },
];

const rendered = resolveRichText(rich, ctx, "render");
assert.equal(rawText(rendered), "Built for barTaco in Hospitality.");
assert.ok(rendered.every((part) => part.variable === undefined),
  "render mode must not leak chip annotations into published output");
assert.ok(rendered.filter((p) => p.text.includes("barTaco"))[0].bold,
  "marks must survive substitution");

const edited = resolveRichText(rich, ctx, "edit");
const chips = edited.filter((part) => part.variable);
assert.equal(chips.length, 2, "edit mode annotates each substituted span");
assert.deepEqual(chips.map((c) => c.variable), ["company.name", "company.industry"]);
assert.equal(chips[0].variableLabel, "Company name");
assert.ok(chips.every((c) => c.unresolved === false), "resolved chips are not flagged unresolved");
assert.equal(rawText(edited), rawText(rendered), "edit and render must agree on the text itself");

const editedBare = resolveRichText(rich, bare, "edit");
assert.ok(editedBare.filter((p) => p.variable).every((c) => c.unresolved),
  "chips flag themselves when the context has no value");

/* --- publish-time check --------------------------------------------- */

assert.equal(findUnresolved("Hi {{company.name}} re {{event.name}}", ctx).length, 0);
const missing = findUnresolved("Hi {{company.name}} re {{event.name}}", { company: { name: "barTaco" } });
assert.equal(missing.length, 1, "only genuinely unresolved variables block publishing");
assert.equal(missing[0].key, "event.name");
assert.equal(missing[0].label, "Event name", "the block dialog shows the human label, not the key");

/* --- regex statefulness (lastIndex is a classic /g footgun) ---------- */

const repeated = "{{company.name}} and {{company.name}}";
assert.equal(resolveString(repeated, ctx), "barTaco and barTaco");
assert.equal(resolveString(repeated, ctx), "barTaco and barTaco", "a second call must give the same result");
assert.equal(findUnresolved(repeated, bare).length, 2);
assert.equal(findUnresolved(repeated, bare).length, 2, "findUnresolved must be repeatable");

console.log(`Variable policy OK: ${BUILT_IN_VARIABLES.length} built-ins, marks preserved, no raw braces escape.`);
