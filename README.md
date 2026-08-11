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
- [ ] Library palette insertion and management screen
- [ ] Block templates informed by real marketing decks (next milestone)
- [ ] Vercel Blob token and voiceover upload
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
