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

### Render parity, block settings, media adjust view (Aug 12, late)

`npx tsc --noEmit` clean, **ten** test scripts passing (`test:parity` is new).

**The present/edit divergence was a real bug, and worse than it looked.**
Floating images are positioned with percentages. In edit mode every block is
wrapped in a `position: relative` element, so an image nested inside a group
resolved its percentages against *the group* in the editor and against the whole
canvas in present mode. Four compounding causes on top of that: the edit canvas
is `height: auto` (so blocks can overflow below the boundary) while present is
`height: 100%`; `.editable-slide-block` added 24px of chrome padding above the
image; `.dnd-node-slot.is-floating-slot .editable-block-content` hardcoded
`aspect-ratio: 4/3`, overriding each image's real ratio; and rotation was applied
at a different tree depth in each mode.

Fixed structurally: `splitFloating()` lifts every float out of the flow tree at
render time into one `.slide-float-layer` that is always exactly the 16:9 box,
used by **both** modes. Geometry is applied to that layer's direct child and
nowhere else. Drag and resize now measure the layer, not the growing canvas. The
stored document is untouched — floats keep their place in the tree for Outline,
drag/drop, and library snapshots.

`npm run test:parity` locks this in: one layer rendered once outside the
edit/present branch, no padding on it, no hardcoded aspect-ratio, no
`doc.blocks.map` anywhere, drag measuring the layer, and no chrome padding on
floating blocks.

**Per-block settings.** Non-image blocks stay in the flow on purpose, so they get
a settings popover in the chrome instead: space above/below, alignment, width,
and a background from the contrast-tested surface set. New `BlockLayout` type on
every node (`spaceBefore`, `spaceAfter`, `align`, `width`) resolved by
`blockLayoutStyle()` so flow, outline, present, and public all agree. Values are
named steps, never pixels — spacing stays on the scale.

**Media modal has two states.** Browse (library left, details right) and Adjust
(image held large and sticky on the left, controls scrolling on the right). The
old layout put focal point, rotation, and crop *below* the preview, so adjusting
them scrolled the thing you were adjusting off screen. Clicking an existing
image opens Adjust; upload and add open Browse; picking a thumbnail while
editing a block jumps to Adjust.

**Two follow-up fixes.** The Adjust view was not filling the modal: the browse
layout is a two-column grid (library + a fixed 340px details column), so hiding
the library left the details pinned in column one with dead space beside it. Edit
view now collapses to a single column and the details fill it, with the image
side taking whatever the controls column does not need (`clamp(280px, 24%,
380px)`). The base preview rule also pins images to 280px tall, which the stage
now overrides.

The block settings panel was being covered by floating images. No z-index on the
panel could fix it: the panel lives inside `.slide-canvas` (z-index 2) and floats
live in `.slide-float-layer` (z-index 9), which are sibling stacking contexts.
Raising the whole canvas while a panel is open —
`.slide-viewport:has(.block-settings-panel) > .slide-canvas { z-index: 12 }` — is
the only thing that works, and it applies only for that moment.

### Slide scaling, line breaks, thumbnails (Aug 12, latest)

`npx tsc --noEmit` clean, ten test scripts passing.

**Slides now scale to themselves.** `.slide-viewport` is a size container
(`container-type: inline-size`) with a `cqw` base font size, and every block
sizes in `em` from it. Slide type was previously `rem` and `vw` — pinned to the
browser window, not the slide — which is why the editor and present mode
disagreed and why the compact strip and thumbnails came out with oversized text.
One knob (`.slide-viewport { font-size }`) now governs the whole scale, and the
same canvas renders correctly at any width.

**Authored line breaks survive.** They were stored in the text run all along but
collapsed in every read-only renderer; only the contentEditable field showed
them. `white-space: pre-wrap` on paragraph, blockquote, callout, title, tagline,
and list items.

**Image position edits stopped being discarded.** `MediaLibraryModal`'s seeding
effect depended on the *node object*, which is rebuilt on every parent render —
so it re-ran constantly and reset the draft to the saved props mid-edit. Keyed
on the node id now, with the current props read through a ref.

**Deck thumbnails are real.** `getDeckSummaries` fetches slide 1's block tree
(one extra query rather than dragging jsonb through the existing aggregate) and
the card renders `SlideCanvas`. This only works because of the container-unit
change above; before it, a thumbnail would have rendered window-sized text.

**Present is a split button** — primary opens at slide 1, the menu offers
present-from-this-slide via `?from=N`, clamped rather than 404'd so a stale link
still presents.

**Panel headers and collapse reworked.** Headers are now a thin accent-tinted bar
at the same scale as a block's chrome, and are labels only. Collapsing moved to
tabs hanging off the workspace edge (`.panel-tabs`), which are deliberately not
the header's toggle group and not the accordion chevron used inside panels. A
collapsed panel leaves its tab behind, so reopening is one click where the panel
was.

`test:parity` now also asserts the slide is a size container, that no slide rule
uses viewport units, and that the pre-wrap rules are present.

### Scaling fix take two, full-screen present, panel tabs (Aug 12, latest)

**The container-unit fix was subtly wrong the first time.** `font-size: 1.9cqw`
was set *on* `.slide-viewport` — the container itself. Container units used in a
container's own styles resolve against an **ancestor** container, and with none
present they fall back to the small viewport. So `cqw` was silently behaving
exactly like `vw`: text scaled with the browser window while the slide did not.
The base font size now lives on `.slide-canvas` and `.slide-float-layer`, which
are children and therefore read the slide's own width. `test:parity` asserts both
halves of this — that the viewport does *not* size itself in container units,
and that the two children do.

**Present mode fills the screen.** It reserved 5rem top / 6.5rem bottom for
chrome that is `position: fixed` and needs no reserved space, then capped the
slide at 1600px. Now the stack takes `min(width-limited, height-limited)` with a
small allowance, and a taller allowance via `:has(.present-voiceover)` when the
player is showing.

**Collapse tabs are pinned to each panel's outer edge**, positioned from the same
`--editor-resource-width` / `--editor-inspector-width` variables the grid uses.
Collapsing sets a width to 0, so the tab slides left with its panel — the panel
goes off, the pull tab stays. Panel headers gained left padding so the
neighbouring tab, which overhangs into them, never covers the label.

**Add slide is a split button** — "Add slide" opens a layout menu with previews
in one or two columns that inserts on selection and closes, plus a Cancel;
"Quick add" repeats the last layout in one click. Labels wrap one word per line
so `line-height: 0.95` is set deliberately.

### Still owed from this round

**Column restructure is done.** Column one is "Library" (reusable blocks and
media only); column two is "Slide" and now holds Add slide, Content, and Design.

**Collapse tabs are gone.** They were unreliable — the pinned-to-panel-edge
positioning fought the grid — and the header toggle group already does the job.
Removed rather than patched; the toggles in the editor header are now the only
way to show and hide panels.

**The Add slide menu overlays** instead of pushing. `.add-slide` is the
positioning context and the menu is absolute with `top: 100%`, so opening the
picker no longer shoves Content and Design down the page. Note the panel's
`overflow-y: auto` clips the menu to the panel box, which is the intended scope
for a panel-level dropdown; `max-height: 62vh` keeps it inside.

### MVP finish: review + publishing (Aug 12, final)

`npx tsc --noEmit` clean, **eleven** test scripts passing (`test:publish` is new).
DNS was changed on the Network Solutions side by Tapps this evening.

**Do this first tomorrow:** run `npm run build` and hit a published deck logged
out, in a private window. `next build` and `next lint` need the platform `swc`
binary and have never run in this workspace — every check so far has been `tsc`
plus the script suite.

**What shipped**

- `src/lib/publish.ts` — pre-publish checks: unresolved variables, missing alt
  text, empty image blocks. Pure, no database. Reports per slide and collapses
  repeats, so a slide with the same problem six times is one line.
- `src/app/decks/publish-actions.ts` — `setDeckStatusAction` (draft ↔ in_review ↔
  approved) and `setDeckSlugAction`. Approving runs the checks and returns
  `blocked` with the list; there is an explicit force. Un-approving **clears
  `published_at`**, which is what actually takes the public URL down.
- `src/lib/data/editor.ts` → `getPublishedDeck()` — requires approved **and**
  `published_at` **and** both slugs. That pairing is the entire access check,
  since `/p/**` has no auth.
- `src/app/p/[client]/[deck]/page.tsx` — the public route. Reuses `PresentDeck`
  with `variant="public"`, which only drops the editor affordances so a client
  never meets a second interface. `noindex` robots plus OG/Twitter tags for
  email link previews.
- `src/app/p/not-found.tsx` — the client-facing 404. Deliberately does not
  distinguish "does not exist" from "unpublished", and links nowhere.
- `src/components/PublishControl.tsx` — the editor-header control: three-step
  status, editable public slug, blocking-issue list with "Publish anyway", and a
  copy-link button that only appears once the link actually works.

**`npm run test:publish`** asserts the Clerk matcher in both directions (`/p/**`
public, editor and library never public, `auth.protect()` on everything else),
that the public query requires approved + published, that un-approving clears
the timestamp, that `noindex` is set, and it unit-tests the issue detector
including decorative images and nested blocks.

**One tradeoff taken:** `tsconfig.json` gains `allowImportingTsExtensions`, and
`publish.ts` imports `./variables.ts` with the extension. Every other
script-tested module is a leaf with type-only imports; `publish.ts` needs the
variable resolver at runtime, and this was better than duplicating it. Safe with
`noEmit`, but worth an eye on the first `next build`.

**Still open before this is genuinely client-ready**

1. `NEXT_PUBLIC_DECKS_ORIGIN` is read by `PublishControl` for the copyable link
   and is **not set** — it falls back to `window.location.origin`, so the copied
   link will say `presentations-untapped.vercel.app` rather than
   `decks.loyaltyuntapped.com`. Set it in Vercel.
2. The end-to-end accessibility pass across everything built today has not been
   done. Individual pieces were reviewed as they were built; the sweep was not.
3. Vercel is still on Hobby, which is licensed non-commercial (`PLAN.md` §8.2).

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
