/**
 * Presentations Untapped — database schema (Neon Postgres via Drizzle).
 * See PLAN.md §3 for the reasoning behind each table.
 * Users live in Clerk; rows store clerk_user_id strings for attribution.
 */
import {
  pgTable, pgEnum, text, integer, real, boolean, timestamp, jsonb, uuid, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { SlideDoc, CaptionCue } from "../slides/types";

export const deckStatus = pgEnum("deck_status", ["draft", "in_review", "approved"]);
export const themeMode = pgEnum("theme_mode", ["light", "dark"]);
export const libraryKind = pgEnum("library_kind", ["block", "slide"]);

/** Shared with library items so one status vocabulary covers decks and library
 *  content alike (LIBRARIES.md §2.4). */
export const libraryStatus = pgEnum("library_status", ["draft", "in_review", "approved"]);

/** category = single-select per item (enforced in the app layer);
 *  tag = free multi-select; person = reserved for photo people-tagging. */
export const tagKind = pgEnum("tag_kind", ["category", "tag", "person"]);

/** Polymorphic taxonomy + comment subjects. No FK on subject_id by design —
 *  delete actions sweep orphans (LIBRARIES.md §2.2). */
export const taggableType = pgEnum("taggable_type", ["library_item", "media_asset", "client"]);
export const commentSubject = pgEnum("comment_subject", ["deck", "slide", "block", "library_item"]);

/** Stored in v1, enforced in v2. `src/lib/auth/policy.ts` is the single
 *  switch point (LIBRARIES.md §2.8). */
export const userRole = pgEnum("user_role", ["admin", "approver", "editor", "viewer"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

/* ------------------------------------------------------------------ */
/* Clients & events — independent of decks (PLAN §3, reqs #1, #2, #10) */

/** Table stays `clients`; the UI says "Company" everywhere (LIBRARIES.md §2.5). */
export const clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  logoUrl: text("logo_url"),           // light-background logo
  logoDarkUrl: text("logo_dark_url"),  // dark-background logo
  logoMarkUrl: text("logo_mark_url"),  // icon/mark only
  website: text("website"),
  industry: text("industry"),
  /** Reference swatches for the company page and {{company.brand.*}} variables.
   *  Deliberately NOT wired into theming — LU tokens are contrast-tested and a
   *  client's raw brand hex is not (LIBRARIES.md §2.5). */
  brandPrimary: text("brand_primary"),
  brandSecondary: text("brand_secondary"),
  /** v1: identifiers + outbound links only. Live sync is v2; these columns
   *  existing now means v2 is purely additive. */
  bitrixId: text("bitrix_id"),
  airtableBaseId: text("airtable_base_id"),
  airtableTableId: text("airtable_table_id"),
  airtableRecordId: text("airtable_record_id"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  notes: text("notes"), // internal notes, always editable outside any deck
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  /** @deprecated Superseded by `company_contacts`. Retained so this migration is
   *  non-destructive; dropped once the backfill is verified in every environment. */
  contactName: text("contact_name"),
  /** @deprecated See `contactName`. */
  contactEmail: text("contact_email"),
  ...timestamps,
}, (t) => [uniqueIndex("clients_slug_idx").on(t.slug)]);

/** Companies have a contact list, not one contact. The legacy
 *  clients.contact_name/contact_email pair migrates into a primary row here. */
export const companyContacts = pgTable("company_contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  title: text("title"),
  email: text("email"),
  phone: text("phone"),
  isPrimary: boolean("is_primary").default(false).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  notes: text("notes"),
  ...timestamps,
}, (t) => [index("company_contacts_client_idx").on(t.clientId, t.sortOrder)]);

/** Event branding layer, e.g. "Catalina Nights" for barTaco (req #2).
 *  Shared across all of that client's decks that reference it. */
export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  ...timestamps,
}, (t) => [index("events_client_idx").on(t.clientId)]);

/* --------------------------------------------------------- */
/* Decks & slides                                             */

export const decks = pgTable("decks", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "restrict" }).notNull(),
  eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  status: deckStatus("status").default("draft").notNull(),
  themeDefault: themeMode("theme_default").default("light").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdBy: text("created_by").notNull(), // clerk_user_id
  ...timestamps,
}, (t) => [
  uniqueIndex("decks_client_slug_idx").on(t.clientId, t.slug), // public URL = /p/[clientSlug]/[deckSlug]
  index("decks_status_idx").on(t.status),
]);

export const slides = pgTable("slides", {
  id: uuid("id").defaultRandom().primaryKey(),
  deckId: uuid("deck_id").references(() => decks.id, { onDelete: "cascade" }).notNull(),
  position: integer("position").notNull(),
  layoutKey: text("layout_key").default("title-paragraph").notNull(),
  /** The block tree — single source of truth rendered by Design view,
   *  Outline view, and Present mode alike (PLAN §3). */
  blocks: jsonb("blocks").$type<SlideDoc>().notNull(),
  /** Set → this is a global slide from the slide library. It renders inert in
   *  the deck: no block chrome, design panels disabled-with-reason, edited only
   *  from /library/slides/[id]/edit (LIBRARIES.md §4.3). */
  libraryItemId: uuid("library_item_id").references((): AnyPgColumn => libraryItems.id, { onDelete: "set null" }),
  libraryVersion: integer("library_version"),
  libraryVariantId: uuid("library_variant_id"), // v2 — version/variant selector
  ...timestamps,
}, (t) => [
  index("slides_deck_idx").on(t.deckId, t.position),
  index("slides_library_item_idx").on(t.libraryItemId),
]);

/* --------------------------------------------------------- */
/* Voiceovers — 1:1 with slides; caption cues inline (req #4) */

export const voiceovers = pgTable("voiceovers", {
  id: uuid("id").defaultRandom().primaryKey(),
  slideId: uuid("slide_id").references(() => slides.id, { onDelete: "cascade" }).notNull(),
  audioUrl: text("audio_url").notNull(), // Vercel Blob URL
  mime: text("mime").notNull(),          // audio/mpeg | audio/mp4 | audio/wav
  durationSec: real("duration_sec").notNull(),
  cues: jsonb("cues").$type<CaptionCue[]>().default([]).notNull(),
  ...timestamps,
}, (t) => [uniqueIndex("voiceovers_slide_idx").on(t.slideId)]);

/* --------------------------------------------------------- */
/* Library — reusable blocks and whole slides (req #20)       */

export const libraryItems = pgTable("library_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: libraryKind("kind").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  /** kind=block → a Node subtree; kind=slide → { layoutKey, doc: SlideDoc } */
  payload: jsonb("payload").notNull(),
  /** Bumped on every payload edit. Deck blocks holding a lower version know they
   *  are stale without diffing JSON (LIBRARIES.md §5.2). */
  version: integer("version").default(1).notNull(),
  status: libraryStatus("status").default("draft").notNull(),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  /** v2 gating; stored now so enabling it is a policy change, not a migration. */
  locked: boolean("locked").default(false).notNull(),
  /** v2 variants: a variation is a child row packaged under its parent. */
  parentId: uuid("parent_id"),
  variantName: text("variant_name"),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by"),
  ...timestamps,
}, (t) => [
  index("library_items_kind_status_idx").on(t.kind, t.status),
  index("library_items_parent_idx").on(t.parentId),
]);

/* --------------------------------------------------------- */
/* Media assets — the DB half of the Blob media library        */

/** Blob cannot hold tags, alt text, or attribution, so the library needs a
 *  table alongside it. Uploads write both; deletes remove both. A one-time
 *  backfill walks the existing `media/` prefix (LIBRARIES.md §2.3). */
export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  url: text("url").notNull(),
  pathname: text("pathname").notNull(),
  name: text("name").notNull(),
  size: integer("size").notNull(),
  mime: text("mime").notNull(),
  width: integer("width"),
  height: integer("height"),
  /** Pre-fills the block's alt text rather than replacing it — alt is contextual,
   *  but nobody should have to write it from scratch every time. */
  defaultAlt: text("default_alt"),
  defaultCaption: text("default_caption"),
  decorative: boolean("decorative").default(false).notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  ...timestamps,
}, (t) => [uniqueIndex("media_assets_pathname_idx").on(t.pathname)]);

/* --------------------------------------------------------- */
/* Shared taxonomy across every library (LIBRARIES.md §2.2)    */

export const tags = pgTable("tags", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: tagKind("kind").default("tag").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  color: text("color"),
  description: text("description"),
  createdBy: text("created_by").notNull(),
  ...timestamps,
}, (t) => [uniqueIndex("tags_kind_slug_idx").on(t.kind, t.slug)]);

/** One tag-picker, one filter builder, one bulk-tag action — reused by all four
 *  libraries. Cost of the polymorphism: no FK on subject_id. */
export const taggings = pgTable("taggings", {
  id: uuid("id").defaultRandom().primaryKey(),
  tagId: uuid("tag_id").references(() => tags.id, { onDelete: "cascade" }).notNull(),
  subjectType: taggableType("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("taggings_unique_idx").on(t.tagId, t.subjectType, t.subjectId),
  index("taggings_subject_idx").on(t.subjectType, t.subjectId),
]);

/** Per-user, not per-team (LIBRARIES.md §10 Q5 — revisit if the team disagrees). */
export const favorites = pgTable("favorites", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(), // clerk_user_id
  subjectType: taggableType("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("favorites_unique_idx").on(t.userId, t.subjectType, t.subjectId),
  index("favorites_user_idx").on(t.userId, t.subjectType),
]);

/* --------------------------------------------------------- */
/* Variables (LIBRARIES.md §7)                                 */

/** v1 seeds the built-ins from code and reads this for the insert menu.
 *  v2 lets people add `manual` variables through settings. */
export const variables = pgTable("variables", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull(),        // e.g. "company.name"
  label: text("label").notNull(),    // "Company name"
  group: text("group").notNull(),    // Company | Event | Deck | Custom
  source: text("source").default("computed").notNull(), // computed | manual
  /** Rendered in present/public when the value cannot be resolved, so a
   *  sentence never breaks and raw braces never reach a client (§7.4). */
  defaultValue: text("default_value"),
  description: text("description"),
  createdBy: text("created_by").notNull(),
  ...timestamps,
}, (t) => [uniqueIndex("variables_key_idx").on(t.key)]);

/* --------------------------------------------------------- */
/* Roles — stored in v1, enforced in v2 (LIBRARIES.md §2.8)    */

export const userRoles = pgTable("user_roles", {
  clerkUserId: text("clerk_user_id").primaryKey(),
  role: userRole("role").default("editor").notNull(),
  ...timestamps,
});

/* --------------------------------------------------------- */
/* Comments — threaded review (built Friday; schema ships now)*/

/** Generalized beyond decks so library items can be discussed — the marketing
 *  conversation about the words belongs with the words, not with one deck that
 *  happens to use them (LIBRARIES.md §2.7). deck_id/slide_id are now nullable
 *  and set only for deck-scoped comments. */
export const comments = pgTable("comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  subjectType: commentSubject("subject_type").default("slide").notNull(),
  /** decks.id | slides.id | library_items.id, per subject_type. */
  subjectId: uuid("subject_id").notNull(),
  deckId: uuid("deck_id").references(() => decks.id, { onDelete: "cascade" }),
  slideId: uuid("slide_id").references(() => slides.id, { onDelete: "cascade" }),
  blockId: text("block_id"),   // nanoid of a Node, null = whole-subject comment
  parentId: uuid("parent_id"), // threading (self-reference resolved in queries)
  authorId: text("author_id").notNull(), // clerk_user_id
  body: text("body").notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [
  index("comments_slide_idx").on(t.slideId),
  index("comments_subject_idx").on(t.subjectType, t.subjectId, t.createdAt),
]);
