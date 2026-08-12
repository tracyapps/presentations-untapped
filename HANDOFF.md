# Development handoff

_Snapshot: August 12, 2026 · branch `main` · commit `cb40de8` (`image bug fixes`)_

Read this file first when opening a new development session. `README.md` is the
setup/status overview; `PLAN.md` is the longer product and technical direction.
Feature work through this checkpoint is committed and pushed to `main`.

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
