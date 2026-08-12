# Presentations Untapped

Internal LU tool for building, reviewing, and publishing client pitch decks.
See [PLAN.md](PLAN.md) for the full product and technical plan. Start with
[HANDOFF.md](HANDOFF.md) when resuming development in a new session.

## Current roadmap status

_Last reconciled with the codebase: August 11, 2026._

- [x] App scaffold, LU tokens/fonts, and light/dark theme
- [x] Neon schema configured and pushed
- [x] Clerk keys, protected app routes, and `/sign-in` route wired
- [x] Dashboard data, client grouping, search/sort, and grid/table views
- [x] New deck flow for existing/new clients, optional events, and a starter slide
- [x] Editor shell, visual/outline views, autosave, and conflict-safe slide persistence
- [x] Content palette, visible block controls, safe layouts, and basic slide management
- [x] Content property editors, cross-container drag-and-drop, ghost/drop indicators
- [x] Save reusable block snapshots from the editor chrome
- [x] Contrast-tested slide/block surfaces, light/dark SVG themes, and LU image masks
- [x] Searchable library palette insertion plus rename/delete management screen
- [x] Reusable media library UI with drag/drop and drive browsing
- [x] Full-screen media picker with reusable references, deletion, alt text, captions, and frames
- [x] Floating image placement plus per-slide image backgrounds with crop/overlay controls
- [x] Structural row/columns/group blocks plus column swapping
- [x] Collapsible palettes with remembered state
- [x] Editor-only 16:9 boundary with reachable overflow; natural-height Outline view
- [x] Content-only Outline view with design controls kept in Design
- [x] Initial collateral-backed block inventory, process block, and timeline/process templates
- [ ] Reconcile and finish the block/template inventory against representative pitch decks (next milestone)
- [x] Connect Vercel Blob and pull its read/write token locally
- [x] Per-slide voiceover upload, shared player, manual cues, and waveform-assisted full-script timing
- [x] Internal present mode with keyboard navigation, overview, themes, and full screen
- [x] Initial Vercel deployment
- [ ] Public-deck DNS

The root directory is the product app. The temporary `clerk-nextjs/` Clerk
quickstart sample was not part of the product and has been removed.

## First-time setup (on your Mac)

```bash
# 1. Keep Dropbox from syncing build artifacts (run BEFORE installing):
mkdir -p node_modules .next
xattr -w com.dropbox.ignored 1 node_modules .next

# 2. Install + configure
npm install
cp .env.example .env.local   # then paste in your Neon / Clerk / Blob keys

# 3. Push the schema to Neon
npm run db:push

# 4. Run it
npm run dev
```

If local startup hangs, reports a missing generated chunk such as
`Cannot find module './32.js'`, or takes minutes instead of seconds, stop the
dev server and move the generated `.next` directory aside before restarting.
Never run `next build` while `next dev` is using the same `.next` directory.

```bash
cache_backup=$(mktemp -d /tmp/presentations-untapped-next-cache.XXXXXX)
mv .next "$cache_backup/stale-next"
npm run dev
```

No source code, database data, or uploaded media lives in `.next`.

## Media storage setup

Image uploads use a public Vercel Blob store because published decks need direct,
cacheable image URLs. In the Vercel project, create or connect a Blob store and
make it available to the Development, Preview, and Production environments.
Vercel commonly injects `BLOB_READ_WRITE_TOKEN`; a named store can instead use a
store-specific variable such as `media_READ_WRITE_TOKEN`. The app accepts both.
Refresh local env with `vercel env pull .env.local --yes` after connecting the
store.

Until the token is present, the media library stays visible but upload controls
are intentionally disabled. Accepted images are JPG, PNG, WebP, and GIF up to
15 MB. SVG uploads are excluded because uploaded SVGs can contain active content.
The same store accepts per-slide MP3, M4A, and WAV voiceovers under a separate
`audio/` prefix with a 25 MB maximum. Replacing or deleting a voiceover removes
the previous Blob; caption cues remain in Neon with the voiceover record.

## Verification commands

```bash
npx tsc --noEmit
npm run test:audio
npm run test:captions
npm run test:styles
npm run test:media
git diff --check
```

Run `npm run build` only after stopping the dev server. Both commands otherwise
write to `.next`, which can produce stale or missing webpack chunks locally.
