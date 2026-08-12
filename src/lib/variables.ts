/**
 * Variable resolution (LIBRARIES.md §7).
 *
 * Variables live as literal `{{company.name}}` text inside RichText. There is no
 * block schema change, which is exactly why a library block self-personalizes
 * the moment it lands in a deck.
 *
 * One resolver, called by SlideCanvas, the outline renderer, PresentDeck, and
 * the public route. Pure — no React, no database — so it is unit-testable.
 */
import type { RichText } from "./slides/types";

/* ----------------------------- Registry ----------------------------- */

export type VariableGroup = "Company" | "Event" | "Deck" | "Custom";

export type VariableDef = {
  key: string;
  label: string;
  group: VariableGroup;
  /** Shown in present/public when the value is missing, so a sentence never
   *  breaks and raw braces never reach a client. */
  defaultValue?: string;
  description?: string;
};

/** v1 built-ins. The `variables` table seeds from this and v2 adds `manual`
 *  rows on top; the insert menu reads the table, not this constant. */
export const BUILT_IN_VARIABLES: VariableDef[] = [
  { key: "company.name", label: "Company name", group: "Company", defaultValue: "your company" },
  { key: "company.website", label: "Company website", group: "Company" },
  { key: "company.industry", label: "Industry", group: "Company" },
  { key: "company.brand.primary", label: "Brand primary color", group: "Company" },
  { key: "company.contact.primary.name", label: "Primary contact name", group: "Company", defaultValue: "there" },
  { key: "company.contact.primary.email", label: "Primary contact email", group: "Company" },
  { key: "company.contact.primary.title", label: "Primary contact title", group: "Company" },
  { key: "event.name", label: "Event name", group: "Event", defaultValue: "the event" },
  { key: "event.date", label: "Event date", group: "Event" },
  { key: "deck.title", label: "Deck title", group: "Deck" },
  { key: "user.name", label: "Your name", group: "Deck" },
  { key: "today", label: "Today's date", group: "Deck" },
];

const BUILT_IN_BY_KEY = new Map(BUILT_IN_VARIABLES.map((v) => [v.key, v]));

/* ------------------------------ Context ------------------------------ */

export type VariableContext = {
  company?: {
    name?: string; website?: string; industry?: string;
    brand?: { primary?: string; secondary?: string };
    contact?: { primary?: { name?: string; title?: string; email?: string; phone?: string } };
  };
  event?: { name?: string; date?: string };
  deck?: { title?: string; status?: string };
  user?: { name?: string; email?: string };
  today?: Date;
  /** v2 manual variables, keyed exactly as stored. */
  custom?: Record<string, string>;
  /** Overrides for defaultValue, loaded from the `variables` table. */
  defaults?: Record<string, string>;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago",
});

/** Walks a dot path against the context. Returns undefined for any missing
 *  segment rather than throwing — a half-filled company is normal. */
function lookup(ctx: VariableContext, key: string): string | undefined {
  if (key === "today") return dateFormatter.format(ctx.today ?? new Date());
  if (ctx.custom && key in ctx.custom) return ctx.custom[key];

  let cursor: unknown = ctx;
  for (const segment of key.split(".")) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  if (cursor === null || cursor === undefined) return undefined;
  const value = String(cursor).trim();
  return value === "" ? undefined : value;
}

/* ----------------------------- Resolution ---------------------------- */

/** `{{ company.name }}` — whitespace tolerated, keys are dot-path word chars. */
export const VARIABLE_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;

export type ResolvedVariable = {
  key: string;
  label: string;
  value: string;
  /** True when the context had no value and a default or the label was used. */
  unresolved: boolean;
};

export type ResolveMode = "edit" | "render";

function resolveOne(key: string, ctx: VariableContext): ResolvedVariable {
  const def = BUILT_IN_BY_KEY.get(key);
  const label = def?.label ?? key;
  const direct = lookup(ctx, key);
  if (direct !== undefined) return { key, label, value: direct, unresolved: false };

  const fallback = ctx.defaults?.[key] ?? def?.defaultValue;
  // Never emit raw braces and never emit an empty string: a client-facing
  // sentence must still read as a sentence (LIBRARIES.md §7.4).
  return { key, label, value: fallback ?? label, unresolved: true };
}

/** Substitutes variables in a plain string, preserving nothing about which
 *  parts were dynamic. Use for titles, alt text, captions, and slugs. */
export function resolveString(input: string, ctx: VariableContext): string {
  return input.replace(VARIABLE_PATTERN, (_match, key: string) => resolveOne(key, ctx).value);
}

/**
 * Substitutes variables across a RichText run, preserving marks.
 *
 * In `edit` mode each substituted span is split out and annotated so the editor
 * can render it as a chip; in `render` mode the text is merged back down and the
 * output is indistinguishable from authored copy.
 */
export function resolveRichText(rich: RichText, ctx: VariableContext, mode: ResolveMode = "render"): RichText {
  const out: RichText = [];

  for (const part of rich) {
    if (!part.text.includes("{{")) { out.push(part); continue; }

    VARIABLE_PATTERN.lastIndex = 0;
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = VARIABLE_PATTERN.exec(part.text)) !== null) {
      if (match.index > cursor) {
        out.push({ ...part, text: part.text.slice(cursor, match.index) });
      }
      const resolved = resolveOne(match[1], ctx);
      out.push(
        mode === "edit"
          ? { ...part, text: resolved.value, variable: resolved.key, variableLabel: resolved.label, unresolved: resolved.unresolved }
          : { ...part, text: resolved.value },
      );
      cursor = match.index + match[0].length;
    }

    if (cursor < part.text.length) out.push({ ...part, text: part.text.slice(cursor) });
  }

  return out.length ? out : rich;
}

/* --------------------------- Publish check --------------------------- */

/** Every variable in a string that will not resolve in the given context.
 *  Drives the blocking confirmation on deck approval — the check that stops
 *  "Hi {{company.name}}" reaching a client (LIBRARIES.md §7.4). */
export function findUnresolved(input: string, ctx: VariableContext): ResolvedVariable[] {
  const found: ResolvedVariable[] = [];
  VARIABLE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = VARIABLE_PATTERN.exec(input)) !== null) {
    const resolved = resolveOne(match[1], ctx);
    if (resolved.unresolved) found.push(resolved);
  }
  return found;
}

/** Plain text of a RichText run, before resolution. */
export function rawText(rich: RichText): string {
  return rich.map((part) => part.text).join("");
}
