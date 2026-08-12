# Development handoff

_Snapshot: August 12, 2026 · branch `main` · commit `cb40de8` (`image bug fixes`)_

Read this file first when opening a new development session. `README.md` is the
setup/status overview; `PLAN.md` is the longer product and technical direction;
**`LIBRARIES.md` is the plan of record for the reusable-component work** —
companies, the three libraries, linked blocks, the shared library shell, and
variables. It supersedes `PLAN.md` §5.4 and §5.9.
Feature work through this checkpoint is committed and pushed to `main`.

## ⚠️ Pick up here — `LIBRARIES.md` steps 1–4 landed

Schema migration has been generated and pushed. Steps 1–4 of the `LIBRARIES.md`
§9 sequence are done; `npx tsc --noEmit` is clean and all **eight** test scripts
pass (`test:variables` is new).

**Two things to run before using the new pages:**

```bash
npm run db:backfill          # dry run — prints exactly what it would write
npm run db:backfill:apply    # writes media_assets rows + primary contacts
```

The media library is DB-backed now, so until the backfill runs it will look
empty even though the Blob assets are all still there. The script is idempotent
and deletes nothing.

**Also:** `src/components/LibraryManager.tsx` is now unreferenced — `/library`
renders `components/library/BlockLibrary.tsx` instead. Delete it (the sandbox
could not).

### What landed

**Foundation**

- `src/lib/db/schema.ts` — `company_contacts`, `media_assets`, `tags`,
  `taggings`, `favorites`, `variables`, `user_roles`; `library_items` gains
  status/approval/lock/version/parent; `clients` gains logo set, brand, and CRM
  id columns; `slides` gains `library_item_id`; `comments` generalized to
  `subject_type`/`subject_id`.
- `src/lib/slides/types.ts` — `NodeLink` on every node, `collectLinkedItemIds`,
  `detachLink`, variable-chip fields on `RichText`.
- `src/lib/auth/policy.ts` — `can()` returns true for everything;
  `PERMISSIONS_OPEN = false` is the entire v2 switch. Every server action already
  calls it.
- `src/lib/variables.ts` — resolver for `{{company.name}}`. Guarantees raw braces
  and empty strings never reach a client. `npm run test:variables`.
- `scripts/backfill-libraries.mjs` — dry-run-by-default backfill.

**Shared shell** — `src/components/library/`

- `LibraryShell.tsx` owns search, filters, sort, view mode, selection,
  range-select, bulk actions, URL sync, and every empty state. Libraries supply
  only `renderView` and their filters/sorts/actions.
- `FilterMenu.tsx` — one filter popover, real fieldset of real inputs.
- `types.ts` — the contract. Read this before adding the next library.
- State placement: search/filters/sort in the URL (shareable, back-button
  works), view mode in localStorage per library, selection never persisted.
- Bulk-action buttons use `aria-disabled` rather than `disabled` on purpose —
  a `disabled` button leaves the tab order, so the reason attached to it could
  never be reached. The click handler enforces the block.

**Block library** — `/library` rebuilt on the shell with grid and list views,
status/category/tag/type/flag filters, four sorts, bulk approve/draft/
categorize/tag/delete, per-user favorites, and usage counts (`Used in N decks`,
computed with `jsonb_path_query` over the slide trees).

### Library interface refinement pass (Aug 12, later)

Driven by the first real test of `/library`. `npx tsc --noEmit` clean, eight test
scripts passing. `next lint` and `next build` were not run — they need the
platform `swc` binary and must run on the Mac.

**Previews are real now.** `BlockPreview` renders the actual block tree through
`BlockTree`, newly exported from `SlideCanvas` so there is one renderer rather
than two. Blocks preview **bare** — no viewport, no 16:9 frame, no surface — and
whole slides will preview as slides. That contrast is how the two libraries tell
themselves apart (`LIBRARIES.md` §11).

**Header is one row.** Search, drafts switch, one combined Filters panel, then
view controls. Specifically:

- Status became a **switch**, not a filter. Approved is always visible; the
  switch only ever adds drafts.
- Block type filter is gone — it cannot describe a nested group.
- Category / Tags / Show-only are stacked inside one `FilterPanel` popover.
- Active filters render as removable pills with a Clear all.
- Sort moved below the toolbar in grid view and is **hidden in table view**,
  where the column headers are the sort control. Sort, view mode, page size, and
  column layout all persist per library in localStorage.

**`DataTable`** — header-click sorting (asc → desc → off), keyboard-operable
column resize (arrows nudge, Home resets), a column show/hide dialog with focus
trap and restore, and `required` columns that cannot be hidden.

**Pagination** — page size selector (24/48/96/All), first-last-window page
numbers, page in the URL.

**`/library/blocks/[id]`** — the single-item screen. Rename, description,
category and tags, approval state, threaded discussion, history with real names,
and delete in its own bordered region at the end. Rename and delete are gone
from the grid card; the card is now navigation.

**Attribution** — `src/lib/data/users.ts` resolves Clerk display names for
`created_by` / `updated_by` / `approved_by`, request-cached. Comments are
generalized to library items via `src/lib/data/comments.ts`.

**Usage counts are real.** They were always 0 because inserted blocks carried no
`link`. `insertLibraryItem` now stamps `{ itemId, version }` on the root node.
Note this only counts blocks inserted **after** this change — anything added
earlier still reads as unused until it is re-inserted or the full linked-block
work (§9 step 7) backfills by payload match.

**Fixed** — `.library-status` had a negative top margin that pulled notices over
the breadcrumbs; notices now render in a fixed slot inside the shell. Library
and detail headers match `.page-heading` rhythm, so the library no longer sits
higher than the decks dashboard. The editor's save-to-library glyph is a
bookmark; the star is now only ever a personal favorite.

### Second refinement pass (Aug 12, evening)

`npx tsc --noEmit` clean, eight test scripts passing.

- **Drafts toggle flipped.** Off by default shows everything; switching it on
  narrows to **Approved only**. URL param is `?approved=1`. The count badge
  appears only while the switch is on, where it says how much is held back.
- **Previews show the whole block.** No height cap, no crop fade. The frame is
  sized from the scaled content, and an `img.onload` listener re-measures after
  images decode.
- **Grid view is masonry** (CSS multicol, `columns: 320px 4`). Column-major
  visual order, DOM order unchanged — see `LIBRARIES.md` §11.
- **Detail screen rebuilt full-bleed** (`.app-shell-wide`, 1800px) with a
  preview band across the top and three columns under it: details left,
  discussion centre and widest, approval/history/delete right. Collapses to two
  columns at 1400px and one at 900px.
- **Column overlap fixed.** The 880px preview render was forcing its container
  wide; `min-width: 0` on `.lib-preview`, `.lib-panel`, and
  `.lib-detail-preview` contains it.
- **`BlockEditModal`** — the smart-object pop-out. Double-click the preview or
  press Edit block. Reuses `SlideCanvas` with a real editor harness (text,
  move, duplicate, delete, drag/drop, column swap, image geometry). Split save:
  **Save changes** overwrites and bumps `version` via
  `saveLibraryItemPayloadAction`; **Save as new version** is visible, disabled,
  and explains itself. Media swapping is not wired in yet — see §12.
- No duplicate action anywhere, on purpose. `LIBRARIES.md` §12 records why.

### Block editability sweep (Aug 12, evening)

Every block type is now fully editable on the canvas. `npx tsc --noEmit` clean,
**nine** test scripts passing (`test:blocks` is new).

**What was actually broken.** Only the five plain-text types (title, tagline,
paragraph, blockquote body, callout body) could be edited on the canvas.
Everything else — stat values, list items, process steps, table cells, pricing
tiers, chart data, blockquote attribution, image caption — was readable but only
editable through Outline's delimiter-separated textareas (`Title | detail`,
`col | col`). Those silently corrupt any copy containing a `|`.

**What changed**

- `SlideCanvasEditor` gains `onUpdateProps(id, props)` — the general prop writer.
  `onText` stays for the five text types. Wired in `SlideEditor` and
  `BlockEditModal`.
- `src/components/Editable.tsx` — `InlineString`, `InlineText`, `InlineNumber`,
  `AddEntry`, `RemoveEntry`. Commit-on-blur so a controlled re-render never
  fights the caret; Enter commits, Escape reverts.
- `RenderContent` rewritten: every visible string is an editable region with its
  own accessible name ("Step 2 title", not "edit text" fourteen times).
- Growable collections: **Add item / step / row / column / tier / feature / data
  point**, each with a labelled remove that disables with a reason at the
  minimum count rather than disappearing.
- Table add/remove column rewrites the header and every row together, so it can
  never go ragged. Chart labels and values are edited as paired points, so they
  cannot drift out of step the way two comma-separated Outline fields allowed.
- Empty fields show a placeholder via `[data-empty]::before` — a zero-width
  target is how optional captions became unfillable.
- Add/remove controls fade in on hover or focus-within, but are never
  `display: none`; that would drop them from the tab order.

**`npm run test:blocks`** asserts every `ContentType` has a `RenderContent` case,
a recorded set of editable fields, an add control per collection, a `!editor`
bail-out so published decks emit no editing affordances, and a `label` on every
inline editor. Adding a block type without an editing path now fails the suite.

### Next

`LIBRARIES.md` §9 step 5 — the media library on the shell, then companies (6),
linked blocks (7), the slide library (8), and variables in the editor (9).

Known shortcuts to replace when the shared `SaveToLibraryDialog` (§6.1) is
built: the Categorize and Tag **bulk** actions still use `window.prompt`, and
bulk delete uses `window.confirm`. Single-item tagging is proper UI on the
detail screen. Also still owed: comment resolve/unresolve, and the version
dropdown above previews once variants exist.

## Current product state

The local and Vercel applications are connected to Clerk, Neon, and Vercel
Blob. The core editor is now a credible working presentation tool rather than a
prototype shell.

### Editor workspace and slide navigation

- Dashboard, deck creation, slide add/duplicate/delete, conflict-aware autosave,
  and Design/Outline/Voiceover views over one JSON block tree are working.
- The far-left resource column owns Add Slide, reusable blocks, and media. Layout
  choices create new slides; the compact top add button repeats the last layout.
- Current-slide layout switching is an intentional control above the slide
  preview instead of sharing the Add Slide palette behavior.
- The horizontal slide navigator supports large thumbnails, compact color/layout
  summaries, and number-only pagination. The current slide preview feeds its
  latest unsaved document into the navigator so thumbnails stay representative.
- Resource, inspector, and slide-strip regions can be resized within safe bounds,
  hidden, and restored. View settings live at the lower right of their panels.
- The inspector is simplified to Content first and Slide Design second. Panels
  and accordion state are remembered locally.
- Design exposes a labeled 16:9 boundary while keeping editor overflow reachable;
  present rendering remains clipped. Outline is natural-height and content-only.
- Direct English text editing, nested block drag/drop, insertion indicators,
  column swapping, reusable block snapshots, and library management are working.

### Media and image editing

- Media supports multi-file browse/drop upload, reusable selection, search,
  preview, rename, reference-aware deletion, and presentation-scoped “replace
  everywhere.” Renames migrate image and background references safely.
- Clicking a media item opens the full viewer/editor rather than forcing edits
  into the narrow palette. Images can be added as flow content, floating slide
  objects, or slide backgrounds.
- Image properties include alt/decorative state, caption, LU SVG frames, natural
  aspect ratio, crop-to-fill/contain, focal X/Y, rotation, floating position,
  proportional size, and background focal/overlay controls.
- Floating images drag from either the photo or header, resize proportionally,
  rotate, and remain clamped inside the slide. Positioning is free by default;
  holding Shift while dragging intentionally snaps to slide edges/centers.
- Native browser image dragging and inactive block-drop overlays no longer steal
  the floating-image pointer interaction. A drag does not open the media picker.
- Temporary on-canvas alignment and layer/reorder buttons were removed. Their
  icons and placement were ambiguous, especially for front/back movement in a
  z-axis. Basic labeled alignment remains in the media properties modal until a
  consolidated properties-menu design is selected.
- Editor tooltips render through the document body, so their viewport coordinates
  remain correct even inside the contained/scaled slide editor.

### Slide rendering, narration, and presentation

- Contrast-checked responsive surfaces, three light/dark SVG patterns without
  the old dimming scrim, and 18 LU masks render consistently in editor/present.
- A provisional collateral-backed inventory lives in `BLOCK-INVENTORY.md`; the
  reusable process block and horizontal/vertical process templates are built.
- Voiceover supports MP3/M4A/WAV upload/replacement, shared accessible playback,
  manual cues, full-script import, and waveform-pause-assisted timing.
- Internal present mode reuses the shared slide/player renderer and supports
  click/keyboard navigation, overview, persisted theme, full screen, and reduced
  motion.

## Product decisions intentionally pending

- Updated wireframes will define a single design-software-style image properties
  surface. It should consolidate alignment and layer actions with recognizable
  horizontal/vertical alignment and z-order/stack semantics.
- Do not reintroduce the temporary alignment strip or arrow-based front/back
  controls before those mockups arrive.
- Additional slide layouts and content blocks should be prioritized from the new
  wireframes and representative marketing decks rather than guessed in isolation.
- Floating images currently stay fully inside the slide. Deliberate off-canvas
  placement, rotation-aware bounds, smart guides, grids, and multi-selection are
  later refinements, not current regressions.

## Recommended next sequence

1. **Apply the updated wireframes.** Start with the consolidated image-properties
   menu and the final alignment/layer interaction; then reconcile panel/chrome
   details without changing the shared slide document model.
2. **Finish the media refinement pass.** Validate crop/focal editing, layer order,
   alignment, replacement, and background behavior together across light/dark and
   several slide layouts. Keep free drag as the default and Shift as explicit snap.
3. **Reconcile templates and blocks.** Audit the representative decks against
   `BLOCK-INVENTORY.md`, then implement the highest-reuse layouts as thin vertical
   slices through Design, Outline, library serialization, and present rendering.
4. **Complete the MVP workflow.** Build `draft → in_review → approved`, then the
   logged-out public approved-deck route and DNS. Reuse `PresentDeck`,
   `SlideCanvas`, and `VoiceoverPlayer`; do not create a separate public renderer.
5. **Run the end-to-end hardening pass.** Cover keyboard/accessibility behavior,
   13-inch and 30-inch workspace sizes, save conflicts, media failures, present
   mode, and logged-out public-route protection before launch.

## Working tree checkpoint

Application feature work was clean at `cb40de8` before this handoff update. If
this wrap-up has not been committed, only the handoff/roadmap documentation
should be new. Always use `git status --short` as the authoritative list.

## Local development safety

This repository lives in Dropbox. Keep `node_modules` and `.next` ignored by
Dropbox. Do not run `npm run build` while `npm run dev` is active: both write to
`.next`, and the shared cache previously caused a 262-second request followed by
`Cannot find module './32.js'`.

If local Next accepts connections but does not respond, or reports a missing
generated chunk:

```bash
# Stop the dev process first.
cache_backup=$(mktemp -d /tmp/presentations-untapped-next-cache.XXXXXX)
mv .next "$cache_backup/stale-next"
npm run dev
```

The last clean restart was ready in 923 ms; the editor's first compile took 2.7
seconds and subsequent requests completed in roughly 331 ms. `.next` contains no
source code, database records, or uploaded Blob media.

For browser verification on this Mac, Google Chrome is installed at
`/Applications/Web/Google Chrome.app` rather than directly under `/Applications`.

## Environment contract

Required local values live in `.env.local` and must never be committed:

- pooled Neon `DATABASE_URL`;
- Clerk publishable/secret keys and `/sign-in` route;
- either `BLOB_READ_WRITE_TOKEN` or the connected store's
  `media_READ_WRITE_TOKEN`.

The Blob token must exist in every Vercel environment that needs media uploads.
The app stores public image URLs under `media/`, permits JPG/PNG/WebP/GIF up to
15 MB, and rejects uploaded SVG.

## Verification baseline

Most recent focused and broad checks passed on August 12:

```bash
npm run test:audio    # formats, 25 MB limit, prefix, package, env contract
npm run test:captions # script splitting, waveform pause detection, cue timing
npm run test:image-geometry # bounds, free placement, Shift snap, alignment, rotation
npm run test:media    # formats, size, prefix, package, env contract
npm run test:media-references # nested images and slide backgrounds migrate safely
npm run test:styles   # 63 readable pairs, 3 SVG themes, 18 masks
npx tsc --noEmit
git diff --check
```

The August 12 production build passed. Chrome verification covers direct English
text editing, SVG theme switching, the resized/hidden workspace, horizontal
slide views, media management, background placement, image crop/focal controls,
free floating-image drag, Shift snapping, resize/rotation, correctly positioned
tooltips, and full-script voiceover input. The interaction test slide was restored
after verification.
