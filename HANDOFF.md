# Development handoff

_Snapshot: August 11, 2026 · branch `main` · base commit `74f52fe` (`images, image library, and media storage settings`)_

Read this file first when opening a new development session. `README.md` is the
setup/status overview; `PLAN.md` is the full product and technical direction.

## Current product state

The local and Vercel applications are connected to Clerk, Neon, and Vercel
Blob. A real user, test deck, saved library block, and reusable uploaded images
exist. The core editing foundation is working:

- Dashboard, deck creation, slide add/duplicate/delete, and conflict-aware
  autosave.
- Design, Outline, and Voiceover tabs over one JSON block tree.
- Named slide layouts with loss confirmation, plus insertable row, columns, and
  group structures.
- Drag/drop within and across containers, drag ghosting, insertion indicators,
  visible move controls, and column swapping.
- Collapsible Layout/Slide Design/Content/Library/Media palettes whose expanded
  state is remembered locally. Slide Design appears only in Design view.
- Design editor displays a labeled 16:9 boundary but lets overflowing blocks
  remain visible and scrollable. Non-editor rendering stays clipped to 16:9.
- Outline expands to natural document height and exposes content/structure only:
  no surfaces, typography formatting, callout variants, or image frames.
- Reusable block snapshots: save from block chrome, search/insert copies from the
  palette, and rename/delete at `/library`.
- Reusable media: upload by browse or file drop, assign existing media by drop,
  delete assets, and choose/edit an image in a full-screen media modal with alt
  text, decorative state, caption, and LU SVG frame.
- Media can also be placed as floating slide objects or used as a full-slide
  background with crop position and configurable readability overlay.
- A provisional marketing-content inventory in `BLOCK-INVENTORY.md`, plus a
  reusable horizontal/vertical process block and matching Timeline/Process
  slide templates based on the available LU one-sheets.
- Per-slide MP3/M4A/WAV upload and replacement, a shared keyboard-operable
  player, Blob cleanup on replacement/deletion, manually timed caption cues,
  and full-script import with client-side waveform pause alignment.
- Internal present mode for draft and later-stage decks: shared slide/player
  rendering, click/keyboard navigation, overview grid, persisted theme choice,
  full-screen support, and reduced-motion handling.
- Contrast-checked responsive surfaces, three light/dark responsive SVG slide
  patterns without the old dimming scrim, and 18 LU image masks.

## Uncommitted working tree

The process-block/template and Voiceover slices are uncommitted. Preserve
`BLOCK-INVENTORY.md`, the related slide model/rendering/style changes, the audio
policy and Voiceover work, and the present route/component/styles. Run
`git status --short` for the authoritative list.

## Next development task

Marketing is still gathering representative slide decks. Reconcile
`BLOCK-INVENTORY.md` when they arrive. The next independent application milestone
is the status/review workflow followed by the public approved-deck route. Reuse
the implemented `PresentDeck`, `SlideCanvas`, and `VoiceoverPlayer` for public
rendering rather than introducing a separate presentation UI.

For later block additions, continue using thin vertical slices through:

1. the shared `ContentNode` type and default-node factory;
2. Design rendering and editor chrome;
3. content-only Outline fields;
4. block-library serialization/insertion;
5. contrast/style checks where a block introduces new color combinations;
6. future-safe non-editor rendering for present/public modes.

UI rearrangement/polish is intentionally deferred until the block inventory is
clear. After the template/block milestone, the planned sequence is Voiceover,
then present/public publishing and DNS.

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

Most recent focused checks passed:

```bash
npx tsc --noEmit
npm run test:audio    # formats, 25 MB limit, prefix, package, env contract
npm run test:captions # script splitting, waveform pause detection, cue timing
npm run test:styles   # 63 readable pairs, 3 SVG themes, 18 masks
npm run test:media    # formats, size, prefix, package, env contract
git diff --check
```

Chrome verification also covers direct Design-mode text editing, SVG theme
switching, floating/background image placement, new image layouts, and the
full-script voiceover input. Run a production build only with the dev server
stopped; the last isolated build passed on August 11.
