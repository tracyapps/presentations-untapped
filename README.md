# Presentations Untapped

Internal LU tool for building, reviewing, and publishing client pitch decks.
See PLAN.md for the full technical plan, pitfalls, and timeline.

## Current roadmap status

- [x] App scaffold, LU tokens/fonts, and light/dark theme
- [x] Neon schema configured and pushed
- [x] Clerk keys, protected app routes, and `/sign-in` route wired
- [x] Dashboard data, client grouping, search/sort, and grid/table views
- [x] New deck flow for existing/new clients, optional events, and a starter slide
- [x] Editor shell, visual/outline views, autosave, and conflict-safe slide persistence
- [x] Content palette, visible block controls, safe layouts, and basic slide management
- [x] Block-specific property editors, rich-text toolbar, and drag-and-drop
- [x] Save reusable block snapshots from the editor chrome
- [x] Contrast-tested slide/block surfaces, fixed SVG themes, and LU image masks
- [x] Searchable library palette insertion plus rename/delete management screen
- [x] Reusable media library UI with drag/drop and drive browsing
- [ ] Block templates informed by real marketing decks (next milestone)
- [ ] Connect Vercel Blob and pull `BLOB_READ_WRITE_TOKEN` locally
- [ ] Voiceover upload
- [x] Initial Vercel deployment
- [ ] Public-deck DNS

The root directory is the product app. `clerk-nextjs/` is a standalone Clerk
quickstart sample and is not used by the product build.

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

## Media storage setup

Image uploads use a public Vercel Blob store because published decks need direct,
cacheable image URLs. In the Vercel project, create or connect a Blob store and
make it available to the Development, Preview, and Production environments.
Vercel injects `BLOB_READ_WRITE_TOKEN` for deployments. Then refresh local env
settings with `vercel env pull .env.local --yes`, or copy the store's read-write
token into `BLOB_READ_WRITE_TOKEN` in `.env.local`.

Until the token is present, the media library stays visible but upload controls
are intentionally disabled. Accepted images are JPG, PNG, WebP, and GIF up to
15 MB. SVG uploads are excluded because uploaded SVGs can contain active content.
