# Reusable systems — companies, libraries, and variables

_Spec written August 12, 2026, against commit `abdaa6b`. Companion to `PLAN.md`
(product/technical direction) and `HANDOFF.md` (session pickup)._

This covers the four reusable-component systems, the shared library interface,
the linked-block model, and the variable system. It is the plan of record for
that work; `PLAN.md` §5.4/§5.9 are superseded by §4, §5, and §7 below.

**Decisions taken with Tapps on Aug 12:**

- Publish/review flow and library foundation proceed **in parallel** — the
  publish flow is small and touches almost none of this surface.
- Linked blocks ship as **link + detach in v1**; variants are designed into the
  schema but the UI lands in v2.
- Roles and lock flags go in the **schema now with no UI gating**, so v2
  permissions are a policy-file change and not a migration.

---

## 1. The shape of the problem

Four libraries, one interaction model. Everything below is in service of two
different users:

| | Marketing | Sales |
|---|---|---|
| Primary verb | Author | Find |
| Cares about | Wording, tone, approval state, who changed what | Search, filter, favorite, drop it in and go |
| Failure mode | Their approved copy gets quietly edited in a deck | Twelve near-identical blocks, none obviously right |

Both failure modes have the same root cause: **no identity for a reusable
thing.** A copy-on-insert library has no identity — the moment a block lands in
a deck it becomes an unrelated orphan. So the linked-block model (§5) is not a
nice-to-have on top of the libraries; it is the thing that makes the libraries
worth having.

The design principle running through all of this: **an item knows where it came
from, and the UI always says so.**

---

## 2. Data model

### 2.1 What exists today

`clients`, `events`, `decks`, `slides`, `voiceovers`, `library_items`,
`comments`. Media has **no table at all** — `getMediaLibrary()` lists the Vercel
Blob prefix directly. That is the single biggest gap: you cannot tag, categorize,
favorite, or attribute an asset that only exists as a blob listing.

### 2.2 Shared taxonomy (new)

One taxonomy serving all four libraries. When someone filters on "hospitality"
they should see blocks, slides, and photos — not three disconnected tag systems.

```
tags          id, name, slug, kind: category | tag | person,
              color?, description?, created_by, timestamps
              unique (slug, kind)

taggings      id, tag_id → tags, subject_type: library_item | media_asset | client,
              subject_id (uuid), created_by, created_at
              unique (tag_id, subject_type, subject_id)
              index (subject_type, subject_id)
```

- `kind: category` — enforced single-select per item in the app layer. This is
  the "what kind of thing is this" axis (Intro, Case study, Team, Pricing).
- `kind: tag` — free multi-select. Industry, tone, campaign, whatever accretes.
- `kind: person` — reserved for photo people-tagging, so it costs nothing later.

Polymorphic `subject_type`/`subject_id` rather than three join tables: one
tag-picker component, one filter query builder, one bulk-tag action, reused four
times. The tradeoff is no FK integrity on `subject_id` — handled by a cleanup
pass in the delete actions.

### 2.3 Media assets (new)

Mirrors what is already in Blob, plus everything Blob cannot hold.

```
media_assets  id, url, pathname (unique), name, size, mime,
              width?, height?,
              default_alt?, default_caption?, decorative bool default false,
              uploaded_by, timestamps
```

Needs a one-time backfill script that walks the Blob `media/` prefix and inserts
rows. After that, uploads write both, and deletes remove both. `getMediaLibrary()`
reads the table and no longer pages Blob on every request — which also fixes the
current N-page listing cost on the editor route.

`default_alt` is deliberately a *default*, not the alt text: alt lives on the
block because it is contextual. The library value pre-fills so nobody types it
from scratch, which is the realistic way to get alt text actually written.

### 2.4 Library items (extended)

```
library_items  + status: draft | in_review | approved  (default draft)
               + approved_by?, approved_at?
               + locked bool default false          -- v2 gating, stored now
               + parent_id? → library_items          -- v2 variants
               + variant_name?                       -- v2 variants
               + version int default 1               -- bumped on every payload edit
               + description?
               + updated_by?
               index (kind, status)
```

`kind` already distinguishes `block` from `slide`, so both libraries share this
table and both get approval, locking, and versioning for free.

`version` is the sync signal for linked blocks (§5). It increments whenever
`payload` changes; a deck holding a lower version knows it is stale without
diffing JSON.

### 2.5 Companies (extended)

Keeping the table named `clients` — renaming costs a migration and touches every
query for no functional gain. **The UI says "Company" everywhere.** Flagging this
as the one naming inconsistency we are accepting on purpose.

```
clients       + website?, industry?
              + logo_dark_url?, logo_mark_url?   -- light logo is existing logo_url
              + brand_primary?, brand_secondary? -- hex, for reference not theming
              + bitrix_id?                       -- CRM record id
              + airtable_base_id?, airtable_table_id?, airtable_record_id?
              + last_synced_at?
              + archived_at?

company_contacts  id, client_id → clients (cascade), name, title?, email?,
                  phone?, is_primary bool, notes?, sort_order, timestamps
```

Existing `contact_name`/`contact_email` on `clients` migrate into a primary
`company_contacts` row and then get dropped.

**Brand colors are reference data, not theming.** They populate a swatch on the
company page and feed variables like `{{company.brand.primary}}`. They do not
retheme the deck — the LU token system is contrast-tested and a client's brand
hex is not. If you later want client-branded accents, that is a deliberate
token-mapping exercise with contrast checks, not a raw hex injection.

**CRM linkage in v1** is these ID columns plus a "View in Bitrix24 ↗" /
"View in Airtable ↗" link and a manual **Import from CRM** paste-a-URL flow.
No API credentials, no sync loop, no webhooks. v2 adds real pull-on-demand and
staleness indicators. The columns existing now means v2 is additive.

### 2.6 Variables (new)

```
variables     id, key (unique),        -- e.g. "company.name"
              label,                   -- "Company name"
              group,                   -- Company | Event | Deck | Custom
              source: computed | manual,
              default_value?,          -- fallback when unresolved
              description?,
              created_by, timestamps
```

v1 seeds this from code with the built-ins and reads it for the insert menu.
v2 lets people add `manual` variables through settings. See §7.

### 2.7 Comments (generalized)

Today `comments` hard-requires `deck_id` + `slide_id`, so library items cannot be
discussed — which breaks the "internal discussion before Jim approval"
requirement outright.

```
comments      deck_id, slide_id → nullable
              + subject_type: deck | slide | block | library_item
              + subject_id (uuid or nanoid as text)
              index (subject_type, subject_id, created_at)
```

Threading via the existing `parent_id` is unchanged.

### 2.8 Roles (stored, not enforced)

```
user_roles    clerk_user_id (pk), role: admin | approver | editor | viewer,
              timestamps
```

Paired with a single `src/lib/auth/policy.ts` exporting `can(user, action,
subject)`. **In v1 every call returns `true`** and the UI renders everything.
v2 is: fill in the policy function, and the disabled states that already exist
in the components start firing. No component rewrites, no migration.

Actions to define now even though they all pass: `library.approve`,
`library.edit`, `library.delete`, `library.unlock`, `slide.editGlobal`,
`variable.manage`, `company.delete`.

---

## 3. The shared library shell

Every library gets the same skeleton and the same muscle memory. Differences are
supplied as slots, never as a different layout.

### 3.1 Anatomy

```
┌─────────────────────────────────────────────────────────────┐
│  Title                                    [ + Add ▾ ]       │  header + add split-button
├─────────────────────────────────────────────────────────────┤
│  [ 🔍 search ]  [Category ▾][Tags ▾][Status ▾][More ▾]      │  filter bar
│                            Sort: [ Updated ▾ ]  View: [▤▦☰] │
├─────────────────────────────────────────────────────────────┤
│  ☑ 3 selected   Tag  Categorize  Approve  Draft  Delete  ✕  │  selection bar (conditional)
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    ← results slot →                         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Showing 24 of 112                              ‹ 1 2 3 ›   │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Component contract

```ts
// src/components/library/LibraryShell.tsx
type LibraryShellProps<T extends { id: string }> = {
  title: string;
  items: T[];
  /** Free-text haystack per item; the shell owns the search input. */
  searchText: (item: T) => string;
  /** Which view modes this library offers; first is the default. */
  views: ViewMode[];                    // "grid" | "list" | "card" | "gallery"
  renderView: (mode: ViewMode, items: T[], selection: Selection) => ReactNode;
  /** Filters beyond the shared taxonomy/status set. */
  extraFilters?: FilterDef[];
  sorts: SortDef<T>[];
  bulkActions: BulkAction<T>[];
  addActions: AddAction[];              // the split-button menu (§6)
  emptyState: { heading: string; body: string; action?: ReactNode };
};
```

The shell owns: search debounce, filter state, sort, view mode, selection set,
range-select, pagination, empty/loading/error states, and URL sync. Callers own
only what their items *look* like.

### 3.3 State persistence

- **Filters, search, sort, page → URL search params.** Back button works, a
  filtered view is a link you can paste to a coworker. This matters more than it
  sounds for a sales team.
- **View mode → localStorage, keyed per library.** It is a personal preference,
  not something to put in a shareable URL.
- Selection is never persisted; it clears on navigate and on filter change (with
  the count announced, so it is not silent).

### 3.4 Accessibility contract

Non-negotiable, same standard as the rest of the app:

- Filter bar is inside a `<search>` landmark. Every control has a visible label
  or an adjacent `<span class="sr-only">`; placeholder is never the only label.
- View toggle is a `radiogroup` with roving tabindex — not three buttons whose
  pressed state is only a background color. Each option has a text label
  available to AT even when it renders icon-only.
- Selection uses real `<input type="checkbox">` with per-row accessible names
  ("Select 'Founder intro'"). The header checkbox exposes indeterminate state.
- Result count and selection count announce through one `aria-live="polite"`
  region. One region, not two competing ones.
- Bulk action bar is `role="toolbar"` with `aria-label`, arrow-key navigation,
  and it does not steal focus when it appears.
- Keyboard: `/` focuses search, `Escape` clears selection then closes popovers,
  `Shift+Click` and `Shift+Arrow` do range selection, `Space` toggles a row.
- Every destructive bulk action confirms with an exact count and item names for
  small selections ("Delete 3 blocks: Founder intro, Stat row, Team grid?").
- Card/grid views: the whole card is not a link. One clear primary link on the
  title, actions as real buttons. Nested interactives inside a link is the most
  common a11y break in this exact pattern.

### 3.5 View modes per library

| Library | Views | Default |
|---|---|---|
| Companies | list, card | list |
| Content blocks | grid (live preview), list | grid |
| Slides | gallery (16:9 thumbs), list | gallery |
| Media | gallery, list | gallery |

Block and slide previews render the real thing scaled down — same trick as the
dashboard thumbnails, no image generation.

---

### 3.6 Two surfaces, one library

The shell renders in two places, and the sameness is the feature.

- **The page** (`/library/blocks`) — `LibraryShell`. Search, filters, and page
  live in the URL, so a filtered view is a link.
- **The picker modal** (in the slide editor) — `LibraryPickerShell`. Identical
  toolbar, filters, sort, views and empty states; state is component-local,
  because rewriting the URL you are editing a slide at, and turning the back
  button into filter history, is not a trade worth making for a popup.

The picker is tabbed — Content blocks, Media, Slides (inert until §4.3 ships) —
so landing on the wrong library costs a click, not a navigation. It has a fixed
preview pane on the right: what you selected, in the version you selected, then
**Add**. Version choice renders as a real disabled control (§8) rather than
being hidden.

Filters, sorts, and the search haystack for blocks live in
`components/library/block-catalog.ts`, imported by both surfaces. A filter added
in one place exists in both by construction.

**The editor sidebar is not a third copy of the library.** It is a drill-down
rail (`DrilldownNav`): groups first — Favorites, then categories, then
Uncategorized — and stepping into one *replaces* the level rather than expanding
below it, so nothing reflows while you are mid-edit. Categories, not tags: a
block has exactly one category, so the groups partition the library and every
block is reachable by exactly one route. Tags overlap by design, which makes
them a good thing to search by in the picker and a bad thing to build a tree
from. Each row offers Preview (hands off to the picker at its confirm step) and
Add. Typing in the rail's search flattens the tree, because while you are typing
the category is not what you are thinking about.

Sidebar sections clamp their height between `--palette-section-min` and
`--palette-section-max` (a share of the viewport, not a pixel count) and are
vertically resizable with the same handle the columns use. A section can never
grow enough to push the one below it off screen.

---

## 4. The four libraries

### 4.1 Companies — `/companies`

List/card of companies with logo, industry, deck count, CRM badge. Detail page
`/companies/[id]` in three regions:

1. **Identity** — name, slug, website, industry, logo set (light/dark/mark),
   brand swatches, archive.
2. **Contacts** — sortable list, one primary, inline add/edit.
3. **Connections** — Bitrix24 and Airtable record IDs with outbound links and
   last-synced timestamp.

Plus **Decks** (all decks for this company, create new inline) and **Events**
(the existing table, managed here rather than buried in deck creation).

A company with zero decks is a normal, expected state — the list must not read
as broken when someone adds a prospect before there is any work.

**Deck ↔ company automation (v1):**

- Deck creation pre-fills title from company + event name.
- "Add company logo" in the media picker: a pinned section above the media
  library showing this company's logo set, one click to place.
- All `{{company.*}}` and `{{event.*}}` variables resolve from the linked record
  (§7).

That is the v1 line. Field-mapping automation, CRM-driven deck generation, and
sync scheduling are v2.

### 4.2 Content blocks — `/library/blocks`

Grid of live-rendered previews. Per item: name, category, tags, status pill,
version, updated-by/at, usage count ("in 4 decks"), favorite star.

Filters: category, tags, status, block type, owner, favorites-only, "used in
this deck".

Bulk: tag, categorize, approve, return to draft, delete, favorite.

**Status is the load-bearing part.** `draft` and `approved` render with
unmistakably different treatment — not a subtle pill. Draft items are visibly
provisional wherever they appear, including inside the deck insert palette, so
a salesperson cannot unknowingly ship unapproved copy to a client. Sales-facing
views default to `approved` only, with an explicit "include drafts" toggle.

**Discussion:** threaded comments on the library item (§2.7), shown in the item
detail drawer with an unresolved-count badge in the grid. Comments are on the
item, not on the deck copy — the conversation about the words belongs with the
words.

### 4.3 Slides — `/library/slides`

Gallery of 16:9 thumbnails. Same shell, same filters, different item renderer
and one extra concept: **these are global by default.**

The editing surface is a **separate route** — `/library/slides/[id]/edit` — and
it must not be mistakable for normal deck editing:

- Distinct header treatment: a full-width banner with its own surface color,
  a lock/globe icon, and the text **"Editing a global slide — changes appear in
  every deck using it."** Not a toast, not a tooltip. Persistent and at the top.
- The deck-specific chrome (slide navigator, add-slide, present) is absent —
  there is no deck here, and its absence is itself a signal.
- Saving names the blast radius: "This slide is used in 6 decks. Save changes?"

**In a deck, a global slide is inert.** When `slides.library_item_id` is set:

- Blocks render with **no chrome at all** — no outlines, headers, drag handles,
  move/duplicate/delete, no direct text editing.
- Add-content palette, structural blocks, and Slide Design are rendered
  **disabled with a visible disabled appearance**, not hidden. Hiding them makes
  people think the app is broken; disabling them with a reason teaches the model.
- A slide-level banner states it is a library slide, names it, and shows either
  **Global** or the selected **version/variant**.
- Inspector offers: version dropdown (v2 — v1 shows "Global" as static text),
  **Edit in Slide Library ↗**, and **Detach — make this a normal slide here**.

Detach copies the payload into the slide and clears the link. It is the escape
hatch that makes the strictness tolerable.

### 4.4 Media — `/library/media`

The functionality gap here is small; the data gap is large (§2.3).

v1: DB-backed listing, tags/categories/people tags, filter by tag, type,
orientation, size, upload date, uploader; bulk tag/categorize/delete; default
alt text and caption; usage count with "used in N slides"; reference-aware
delete (already built) surfaced in bulk delete too.

Explicitly v2: cropping beyond the existing focal/crop controls, filters,
adjustments, background removal, any generative editing. Finding the right photo
fast is the whole job in v1.

---

## 5. Linked blocks

### 5.1 Model

Every `Node` gains an optional link:

```ts
type NodeLink = {
  itemId: string;        // library_items.id
  version: number;       // library version at last sync
  variantId?: string;    // v2 — reserved
  locked?: boolean;      // v2 — reserved, mirrors library_items.locked
};

type LayoutNode  = { …existing; link?: NodeLink };
type ContentNode = { …existing; link?: NodeLink };
```

Only the **root node** of an inserted subtree carries the link. Children are
plain nodes; they are the snapshot.

### 5.2 Resolve-on-load with snapshot fallback

The subtree stored in the slide document **is** the cached copy. On editor and
render load:

1. Collect every `link.itemId` in the document.
2. Fetch those library items in one query.
3. If `library.version > link.version`, replace the subtree with a freshly cloned
   library payload (new node ids, link preserved with the new version). Mark the
   slide dirty so the refresh persists on next save.
4. If the library item is **gone**, keep the stored subtree, strip the link, and
   surface a notice: "'Founder intro' was removed from the library. This block is
   now a normal block on this slide."

No separate snapshot column, self-healing, and a deleted library item can never
blank out a slide in front of a client. This replaces the copy-on-insert
statement in `PLAN.md` §5.4.

### 5.3 In-deck behavior

A linked group renders as **one unit**:

- One chrome header for the whole group, visually distinct from normal block
  chrome (link icon + library item name + version).
- Children have no individual chrome and are not directly editable.
- It drags, duplicates, and deletes as a single object.
- Duplicating a linked block yields a second linked instance, not a copy.

⋮ menu / right-click, v1:

| Action | Behavior |
|---|---|
| **Detach into blocks** | Strips the link; children become normal editable blocks on this slide. Confirmed, non-destructive, one-way (re-linking is not a v1 feature). |
| **Edit in library ↗** | Opens the library item editor. Warns first: "Editing changes this block in every deck that uses it (currently 4)." |
| **Go to library item** | Read-only detail drawer — usage, status, comments, tags. |

Deliberately v2, schema already supports it: **Save as new variation**, which
would fork to a child `library_items` row under `parent_id` with a
`variant_name`, packaged under the parent in the picker. Hidden in v1 rather
than shown-disabled — a disabled menu item people can never enable is noise.

### 5.4 Naming

"Break into blocks" was the working phrase. Recommending **"Detach into blocks"**
— *break* reads as damage, and this action is safe and reversible-by-undo.
Corresponding badge verb on the block is **Linked**, and the library-side concept
is **Used in N decks**. Open to being overruled; pick one and use it everywhere.

---

## 6. Adding to a library

Every library takes items from at least three directions. The **Add ▾** split
button is the shell-level home for these:

| Library | From the library page | From a deck | Other |
|---|---|---|---|
| Companies | New company; Import from Bitrix24/Airtable (paste URL) | Create during deck setup | CSV import (v2) |
| Blocks | New block (compose in a mini editor) | ★ on any block; ⋮ → Save to library | Duplicate an existing item |
| Slides | New slide from layout | ⋮ on a slide → Save to slide library | Duplicate an existing item |
| Media | Upload; drag-drop onto the page | Upload in the media picker; drop on canvas | Paste from clipboard |

### 6.1 The save dialog

One shared `<SaveToLibraryDialog>` used from every entry point, including from
inside a deck.

**Hard rule: metadata never blocks the save.** The name field is focused, Enter
saves, done. Category, tags, status, and description sit below as optional
fields, with the last-used category pre-selected and tag suggestions from
recent use. If someone is mid-deck at 4:45pm they get to save and move on; if
they have a spare ten seconds the fields are right there.

Untagged items are not lost — the shell has a permanent **Needs tagging** filter,
which is how the tidy-up actually gets done later, in bulk, by whoever is in the
mood.

---

## 7. Variables

### 7.1 Syntax

**`{{company.name}}`** — double braces, dot paths.

Working shorthand was `{client-name}`. Recommending double braces because single
braces collide with CSS/JS when blocks get pasted around, `PLAN.md` §5.9 already
specifies this form, and dot paths extend cleanly to
`{{company.contact.primary.name}}` without inventing separators. Worth a two-
minute confirmation before it is in stored content, since changing it later means
migrating every saved block.

### 7.2 Storage and resolution

Variables live as literal text inside `RichText`. **No block schema change** —
which is exactly why library blocks self-personalize the moment they land in a
deck.

```ts
type VariableContext = {
  company?: { name, slug, website, industry, brand: { primary, secondary },
              contact: { primary?: { name, title, email, phone } } };
  event?:   { name, date? };
  deck?:    { title, status };
  user?:    { name, email };
  today:    Date;
};

resolveText(rich: RichText, ctx: VariableContext, mode: "edit" | "render"): RichText
```

One resolver, called by `SlideCanvas`, the outline renderer, `PresentDeck`, and
the public route. Because all four already share the tree, this is one insertion
point per renderer.

### 7.3 v1 built-ins

`company.name` · `company.website` · `company.industry` ·
`company.contact.primary.name` · `company.contact.primary.email` ·
`event.name` · `event.date` · `deck.title` · `today`

### 7.4 Unresolved variables

Three distinct behaviors, because the stakes differ:

- **Editor** — renders as a visible chip showing the variable's label, whether or
  not it resolves. You can always see that it is dynamic. A resolved chip shows
  the value with a subtle marker; unresolved shows the label in a warning
  treatment.
- **Present / public** — renders `default_value` if set, otherwise the plain
  label text. Never renders raw `{{…}}` braces to a client. Never renders empty,
  which would silently break a sentence.
- **Publishing** — approving a deck with unresolved variables raises a blocking
  confirmation listing every one and the slide it is on. This is the check that
  stops "Hi {{company.name}}" reaching a client.

Chips must be keyboard-navigable and announce as text to screen readers — a
`<span>` with the resolved text as content and the variable name in the
accessible name, not an `aria-hidden` decoration.

### 7.5 v2

Custom variables in a settings area, per-deck overrides, computed/derived
variables, conditional blocks, and variables in image sources (client logo by
variable rather than by pinned picker section).

---

## 8. v1 / v2 line

**v1**

Schema for everything below including v2 hooks · shared library shell · four
library interfaces · company detail with contacts and CRM ID links · block
library with search/filter/categorize/CRUD, draft+approved states, threaded
comments · slide library with the separate distinctly-labeled edit route and
inert in-deck rendering · media library on a real table with tags and
categories · linked blocks with detach and edit-at-source · variables with the
built-in set and the publish-time check · roles and lock columns stored,
ungated.

**v2**

Variants/versions of blocks and slides · role-gated approval ("only Jim can
approve") · locked blocks · @-mention notifications · live Bitrix24/Airtable
sync · custom variables and automation settings · media editing tools · CSV
import · relink a detached block.

---

## 9. Build sequence

Ordered so each step is independently shippable and nothing sits half-migrated.

1. **Schema + migration + media backfill.** Everything in §2 in one migration.
   Nothing else can start cleanly until this lands. *(in progress)*
2. **Policy module + variable resolver.** Two small pure modules with unit
   scripts, no UI. They are dependencies of nearly everything after.
3. **Shared library shell.** Built against the block library as its first
   consumer, but with all four in mind.
4. **Block library page** on the shell — filters, bulk actions, status, comments.
5. **Media library page** on the shell + the tagging pass.
6. **Companies** list, detail, contacts, CRM links, logo pinning in the picker.
7. **Linked blocks** — node link field, resolve-on-load, in-deck group chrome,
   detach, edit-at-source.
8. **Slide library** — global slide route, inert in-deck rendering, disabled
   panel states.
9. **Variables in the editor** — insert menu, chips, publish check.
10. **Hardening pass** — keyboard and screen-reader run through all four
    libraries, 13" and 30" widths, light and dark, empty and 500-item states.

Steps 1–2 and the publish/review flow proceed in parallel; they do not touch the
same files.

---

## 10. Decisions and open questions

**Settled**

1. **Variable syntax** — `{{company.name}}`. Double braces, dot paths. (§7.1)
2. **Company vs Client** — table stays `clients`, UI says "Company"
   everywhere, variable namespace is `company.*`. (§2.5)
3. **Drafts, not a status filter** — status is a switch in the toolbar, not a
   multi-select. Approved content is always visible and the switch only ever
   *adds* drafts, so nobody can filter into a draft-only list and ship from it.
4. **Favorites are per-user.** The star means "mine". (§4.2)
5. **Icons** — a **bookmark** saves a block to the library; a **star** is a
   personal favorite. One glyph cannot mean two things.
6. **Editing one item is its own route**, not an inline card editor or a modal.
   `/library/blocks/[id]` is linkable, which is exactly what approval needs
   ("Jim, approve this: <url>"), and it gives discussion and approval the room
   they will need. Delete lives there, in its own bordered region, rather than
   on a card being scanned quickly.
7. **Block type is not a filter.** It cannot describe a nested group, and what
   people hunt for is the content, not the shape.

**Still open**

8. **"Detach into blocks"** — confirm the wording, or pick another and it gets
   used everywhere. (§5.4)
9. **Category vocabulary** — the taxonomy is free-text today, which is how
   libraries get eleven near-identical categories. Worth agreeing a starting set
   (Intro, Case study, Stats, Team, Pricing, Close…) and seeding it.

---

## 11. Preview rules

The two reusable libraries are told apart by how their items preview, and this
is deliberate rather than incidental:

- **Content blocks preview bare.** `BlockPreview` renders the real block tree
  through the shared renderer with no slide viewport, no 16:9 frame, no surface
  or pattern. You are choosing a content group — a stat card, an intro
  paragraph, an image-and-text pair — so it shows as itself.
- **Whole slides preview as slides**, in frame, with their styling. That is
  `SlidePreview`, landing with the slide library.

Scaling is a CSS transform over a full-width render, not shrunken font sizes, so
the type hierarchy inside a block survives. Previews are `aria-hidden` — the
name, status, and tags beside them are the accessible content, and a scaled
visual duplicate would just be noise in a screen reader.

Version and variation switching on a preview is designed (a dropdown above the
preview selecting parent/variant) but **hidden until the variant schema is
live** — a control nobody can ever use is noise.

Grid view is **masonry** (CSS multicol), because blocks are genuinely different
heights and a strict grid either crops them or leaves holes. The tradeoff:
multicol fills column 1 top-to-bottom before column 2, so visual order is
column-major while DOM order — and therefore keyboard and screen-reader order —
stays the sorted order. For a browse-and-pick library that is the right trade.

---

## 12. Editing a library block

A library block is a **source object**, edited the way a Photoshop smart object
is: double-click the preview (or press **Edit block**) and it pops out into the
same canvas a deck uses, with the same chrome and the same interactions. Saving
pushes back to the library. You never edit a library block by accident, and you
never have to open a deck to edit one.

The save control is a **split button**, and that shape is the whole point:

| | Behavior |
|---|---|
| **Save changes** | Overwrites the source and bumps `version`. Everything linked picks it up. The header names the blast radius first — "Saving updates this block in 6 decks." |
| **Save as new version** | Forks a named variant under this parent. **v2** — needs the variant schema. Ships now as a visible, disabled item with its naming field, because people only reach for versions if they can see that versions are where this is going. |

**There is deliberately no "duplicate this block."** Duplicating forks a new
parent and orphans the discussion, approval history, and usage that make a
library item trustworthy — it is the single fastest way to end up with eleven
near-identical blocks and no idea which is current. Versions are the intended
path. If a duplicate escape hatch is ever added it belongs in the library grid,
not on the item's own screen, and it should be less prominent than versioning.

Media assignment is not wired into the pop-out yet: the media picker is a
deck-scoped surface today. Image geometry (position, crop, focal point,
rotation) is editable; swapping the image itself is done in a deck for now.
