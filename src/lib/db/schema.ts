/**
 * Presentations Untapped — database schema (Neon Postgres via Drizzle).
 * See PLAN.md §3 for the reasoning behind each table.
 * Users live in Clerk; rows store clerk_user_id strings for attribution.
 */
import {
  pgTable, pgEnum, text, integer, real, timestamp, jsonb, uuid, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import type { SlideDoc, CaptionCue } from "../slides/types";

export const deckStatus = pgEnum("deck_status", ["draft", "in_review", "approved"]);
export const themeMode = pgEnum("theme_mode", ["light", "dark"]);
export const libraryKind = pgEnum("library_kind", ["block", "slide"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

/* ------------------------------------------------------------------ */
/* Clients & events — independent of decks (PLAN §3, reqs #1, #2, #10) */

export const clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  logoUrl: text("logo_url"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  notes: text("notes"), // internal notes, always editable outside any deck
  ...timestamps,
}, (t) => [uniqueIndex("clients_slug_idx").on(t.slug)]);

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
  ...timestamps,
}, (t) => [index("slides_deck_idx").on(t.deckId, t.position)]);

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
  /** kind=block → a Node subtree; kind=slide → { layoutKey, doc: SlideDoc } */
  payload: jsonb("payload").notNull(),
  createdBy: text("created_by").notNull(),
  ...timestamps,
});

/* --------------------------------------------------------- */
/* Comments — threaded review (built Friday; schema ships now)*/

export const comments = pgTable("comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  deckId: uuid("deck_id").references(() => decks.id, { onDelete: "cascade" }).notNull(),
  slideId: uuid("slide_id").references(() => slides.id, { onDelete: "cascade" }).notNull(),
  blockId: text("block_id"),   // nanoid of a Node, null = whole-slide comment
  parentId: uuid("parent_id"), // threading (self-reference resolved in queries)
  authorId: text("author_id").notNull(), // clerk_user_id
  body: text("body").notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [index("comments_slide_idx").on(t.slideId)]);
