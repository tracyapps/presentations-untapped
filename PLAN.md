# Presentations Untapped — Technical Plan

Internal tool for spinning up client pitch decks: block-based slide editor, reusable library, per-slide voiceovers with captions, internal draft review, and one-click publishing to a public URL under loyaltyuntapped.com.

**Target: usable by Thursday EOD (Aug 13, 2026).** The reconciled sequence in
§9 reflects the actual August 11 implementation state.

## Implementation snapshot — August 11, 2026

The deployed and local app currently has Clerk authentication, Neon persistence,
deck creation/dashboard flows, a three-view editor shell, safe slide autosave,
layout migration, slide management, nested structural blocks, cross-container
drag/drop, reusable block snapshots, a Vercel Blob media library, contrast-safe
slide styles, SVG backgrounds, and LU image masks. Design mode shows a labeled
16:9 boundary while keeping overflow reachable for editing. Outline is a
natural-height content/structure editor and intentionally contains no design
controls. Per-slide voiceover upload, the shared accessible player, manual
caption cues, and internal present mode are implemented. Review/publishing and
public routes remain planned.

**Next development milestone:** reconcile the provisional collateral-backed
inventory in `BLOCK-INVENTORY.md` against collected real marketing decks, then
continue implementing missing high-value content blocks. The first inventory
slice—a direction-aware process block with timeline/process templates—is now in
place. See `HANDOFF.md` for the exact pickup checklist.

---

## 1. Stack (decided)

| Layer | Choice | Cost | Why |
|---|---|---|---|
| Framework | Next.js 15 (App Router, TypeScript) | free | One codebase for editor app + public published decks; server components keep the public decks fast/simple |
| Hosting | Vercel | free (Hobby) | Zero-config deploys, custom domains. ⚠️ Hobby plan is licensed for *non-commercial* use — fine while pre-revenue, budget $20/mo Pro once clients land |
| Database | Neon Postgres (free tier) | free | 0.5GB is plenty; branchable for testing. ⚠️ autosuspends when idle → first query after a lull takes ~500ms. Acceptable for an internal tool |
| ORM | Drizzle | free | Type-safe, lightweight, plays well with Neon serverless driver |
| Auth | Clerk (free tier, invite-only) | free to 10k MAU | Decided. Drop-in `<SignIn/>`, org invites, no SSO needed. Disable public sign-ups; team members are invited by email from the Clerk dashboard |
| File storage (images now; audio later) | Vercel Blob | free tier | Public, cacheable media URLs; migrate to Cloudflare R2 if needed |
| Rich text | Typed JSON runs + native inputs | free | Current Outline editing preserves stored marks while keeping design controls out of Outline; a richer Design-side control can be added later |
| Drag & drop | Native HTML5 DnD + typed controller | free | Current implementation supports nested cross-container moves, ghosting, and drop indicators; visible move buttons remain the keyboard fallback |
| Editor state | React state + server actions + debounced autosave | free | Conflict-aware persistence without a separate client store; Zustand is installed but not currently required by the editor |

**Total running cost today: $0.** First real cost is Vercel Pro ($20/mo) when the tool is used commercially in earnest.

### External services — current status

- **Vercel:** project deployed successfully from the Git repository.
- **Neon:** project created, schema pushed, and live data verified locally and on Vercel.
- **Clerk:** application configured and the first user created; protected routes work.
- **Vercel Blob:** connected and verified for local upload, reuse, and deletion.
- Keep `.env.local` and Vercel Development/Preview/Production variables aligned
  using `.env.example` as the non-secret contract.

---

## 2. Reuse from existing LU work

- **`lu-design-system/build/css/tokens.css` + `tokens.dark.css`** — copied into the app verbatim as the styling foundation. Light/dark already solved via `[data-theme="dark"]`. One correction applied per the brand decision: `--font-display` is overridden to `Montserrat, sans-serif` (regular Montserrat, NOT Alternates) for all title styles.
- **`LU-2.0` theme fonts** — `montserrat-variable.woff2`, `inter-variable.woff2` copied into `/public/fonts` and self-hosted (no Google Fonts request, better privacy + perf). Logos from `assets/logos/` too.
- **`lu_techstack-deck`** — its `styles.css` has proven slide patterns (stat cards / `.big-number`, callouts, comparison cards, pricing table) that seed the styling of the corresponding content blocks, with the heading-font fix applied.

---

## 3. Data model

```
clients        id, name, slug, logo_url, notes (rich), contact fields, timestamps
events         id, client_id → clients, name, logo_url          -- e.g. "Catalina Nights" for barTaco
decks          id, client_id → clients, event_id? → events, title, slug,
               status: draft | in_review | approved,
               theme_default: light | dark, published_at, timestamps
slides         id, deck_id → decks, position, layout_key, blocks (jsonb — the block tree), timestamps
voiceovers     id, slide_id → slides (1:1), audio_url, duration_sec, mime
captions      (cues stored on voiceovers as jsonb: [{ start, end, text }])
library_items  id, kind: block | slide, name, payload (jsonb subtree or full slide), preview meta, timestamps
comments       id, deck_id, slide_id, block_id?, parent_id? (threading), author, body,
               resolved_at, timestamps                          -- built Friday, schema ships now
users          — lives in Clerk; we store clerk_user_id on rows that need attribution
```

Key decisions:
- **Clients are independent of decks** (req #1): a client with zero or five decks is fine; client details editable from a standalone settings area.
- **Events are their own table** (req #2): "Catalina Nights" can be shared by multiple barTaco decks. Deck branding = LU brand + client + optional event name/logo.
- **The block tree is one jsonb document per slide.** Design view, outline view, and present mode are three renderers over the *same* tree — this is what makes toggling views seamless (req #19).

### Block tree shape (shared TypeScript types)

```ts
type SlideDoc = { version: 1; blocks: Node[]; style?: { surface?: string; pattern?: string } };
type Node = LayoutNode | ContentNode;

type LayoutNode = {
  id: string;                       // nanoid
  kind: "layout";
  type: "row" | "columns" | "grid" | "group";
  props: { cols?: number; gap?: string; align?: string };
  children: Node[];
  style?: { surface?: string };
};

type ContentNode = {
  id: string;
  kind: "content";
  type: "title" | "tagline" | "blockquote" | "callout" | "paragraph"
      | "image" | "list" | "statCard" | "table" | "pricingTable" | "chart";
  props: Record<string, unknown>;   // rich text; image src/media/alt/caption/frame; tables; stats…
  style?: { surface?: string };
};
```

- Every renderer switch()es on `type`. Adding a new block type = one type entry + three small renderer components + a library palette entry.
- **Image blocks require alt text** (empty alt allowed only via an explicit "decorative" checkbox).

### Slide layouts (req #17)
Layouts are named skeleton templates (`title-paragraph`, `two-column`, `title-only`, `stat-row`, `image-left`, `full-bleed-image`, `quote`, …) defined in code as functions that produce a starter block tree, plus a tiny lines-and-boxes SVG for the visual dropdown. Changing layout runs a **migration**: content nodes are matched into the new skeleton's slots by type/order; anything that won't fit is listed in a confirmation dialog ("These 2 blocks will be removed…") before applying — never silent (req #17).

---

## 4. App structure

```
/                         → redirect to /decks (or sign-in)
/decks                    → dashboard: grid + table views, search, sort (created/modified), grouped by client
/decks/new                → name + pick/create client (+ optional event)
/decks/[id]/edit/[slide]  → editor: Design | Outline | Voiceover tabs
/decks/[id]/present       → internal present mode (implemented; works for draft decks too)
/clients                  → client list + settings panel (planned)
/library                  → manage saved blocks (slide library items planned)
/p/[clientSlug]/[deckSlug]→ public approved deck (planned) — served at decks.loyaltyuntapped.com/[clientSlug]/[deckSlug]
```

Clerk middleware protects everything except `/p/**` (and static assets). **Gotcha:** getting the public matcher right is a classic Clerk footgun — test logged-out access to a published deck explicitly.

---

## 5. Feature specs

### 5.1 Dashboard (req #8)
Grid (thumbnail cards) and table (list) views, toggle persisted per user (localStorage). Group-by-client sections; search across deck title + client name; sort by created/modified. Thumbnails: render slide 1 small from the block tree (a real DOM render scaled down — no image generation needed).

### 5.2 Editor — three tabs (req #11–19)

**Shared chrome (implemented):** tabs (Design / Outline / Voiceover), "editing slide N of M", add/duplicate/delete slide controls, slide strip/switcher, collapsible Layout/Content/Library/Media palettes with local remembered state, Save + Close, a diff-derived save-state indicator, autosave debounced two seconds after the last change, a disabled Save button when clean, conflict detection, and a `beforeunload` guard when dirty.

**Design view (implemented foundation):** left panel = visual layouts, structural blocks, content blocks, slide design, reusable library, and reusable media. Right = a responsive 16:9 slide boundary. Normal preview/presentation rendering clips to that boundary; editor rendering exposes overflowing blocks below it and lets the page scroll so every block remains reachable. Blocks can move within and across row/column/group containers with a ghost state and highlighted insertion line.

Every block gets **always-visible chrome** (req #14): a thin outline + mini header bar with a drag-only region, block name, move up/down, duplicate, save to library, and delete controls. Column layouts also expose Swap Columns. Custom edge-aware tooltips can render emphasized shortcut hints later. Blocks remain focusable and visible move buttons provide the non-drag fallback.

**Outline view (req #19, implemented foundation):** same structural/content/library/media palette; Slide Design is hidden. The right side renders the same tree as natural-height nested labeled boxes with plain content fields, media/accessibility details, drag/drop, and column swapping. All surfaces, image frames, callout color variants, and rich-text formatting controls are intentionally excluded so Outline stays focused on content and structure. Existing design data is preserved when content changes, so toggling remains lossless.

**Voiceover view (req #21, implemented):** left = upload zone (mp3/m4a/wav, 25MB cap) + clip info + delete/replace; right = the reusable player preview plus the **caption cue editor**: rows of start / end / text fields, a "＋ cue at playhead" button, and client/server validation for empty text, overlaps, ordering, and clip bounds. This *is* the manual transcription editor (auto-transcription later feeds the same rows).

### 5.3 Voiceover player (req #4, implemented) — one component reused in editor preview, present mode, and public decks
Big circular play button showing clip length → expands to transport: play/pause, back 10s, forward 10s, seekable timeline (a real `<input type=range>` — accessible by default), current/total time, CC toggle. Captions render in a live region below the slide, styled by tokens. `<audio preload="metadata">`, keyboard operable, visible focus states.

### 5.4 Library (req #20)
Save **from** the editor: the block star action names and snapshots the subtree. Insert **into** a deck: the searchable Library palette inserts a fresh copy. `/library` currently supports search, rename, and delete; existing slide copies are unaffected by library deletion. Slide-level library items and library-item editing are still planned. Library inserts are **copies**, not live-synced instances.

### 5.5 Media library (implemented foundation)

Vercel Blob stores public JPG, PNG, WebP, and GIF assets under an isolated
`media/` prefix with a 15 MB maximum. The editor palette supports drive browse,
file drag/drop, reuse, and deletion. Dragging an existing library asset onto an
image block assigns the existing URL rather than re-uploading it. Clicking an
image opens a full-screen media picker containing upload + library views, alt
text, decorative state, optional caption, and LU SVG frame selection. Deleting
an asset warns that existing slide references will stop rendering it.

### 5.6 Present mode (req #3, implemented)
Dead simple: full-screen slide (Fullscreen API + fallback), ← → / space / click to advance, `Esc`/`G` for **overview grid** (all slides, click to jump), slide counter, persisted deck-specific theme toggle, and the shared voiceover player when present. It reuses `SlideCanvas`, respects `prefers-reduced-motion`, and works for internal drafts. The future public route can reuse the same presenter without teaching clients a second interface.

### 5.7 Publishing + status flow
`draft → in_review → approved`. Approving prompts to confirm the public slug and sets `published_at`; the deck is then live at `decks.loyaltyuntapped.com/[client]/[deck]`. Un-approving (back to draft) 404s the public URL. Public pages: no auth, `noindex` robots meta (decks are for clients, not Google), OG tags with deck title + client/event branding for nice link previews in email.

### 5.8 Review comments (Friday+, schema ships Thursday)
Comment affordance on each slide and on each block (via ⋮ menu) → threaded panel (parent_id threading, resolve/unresolve, author + timestamp from Clerk). Deck-level "Request review" flips status to `in_review` and surfaces a review banner to other users.

### 5.9 Client personalization (Phase 2, cheap win)
Merge tags in text blocks — `{{client.name}}`, `{{event.name}}` — resolved at render. Makes library slides self-personalizing when dropped into any client's deck.

---

## 6. Theming & accessibility (non-negotiables)

- Tokens only; no hardcoded colors. `data-theme="dark"` on `<html>`, toggle in editor chrome AND present/public views (req #7), default = deck's `theme_default`, respects `prefers-color-scheme` on first visit, persisted in localStorage.
- WCAG 2.1 AA targets: full keyboard operability (block moves, slide nav, player), focus visible everywhere, `aria-live` announcements for autosave status + dnd moves + caption text, alt text enforced on images, contrast checked in both themes (the token system was already built for this), reduced-motion respected.
- All destructive actions (delete slide, delete block, layout change with loss, un-publish) get explicit confirmation dialogs (req #17, #18).

---

## 7. DNS / publishing runbook (Network Solutions, complete before public launch)

One-time setup, ~10 minutes, then publishing is fully automatic forever:

1. In Vercel → Project → Settings → Domains → add `decks.loyaltyuntapped.com`.
2. Vercel shows a CNAME target (`cname.vercel-dns.com`).
3. Network Solutions → Account Manager → Domain → **Manage DNS / Advanced DNS** → Add record: Type `CNAME`, Host `decks`, Points to `cname.vercel-dns.com`, TTL lowest offered.
4. Wait for propagation (usually minutes; NS can take hours — hence Tuesday). Vercel auto-issues the SSL cert once it resolves.

**Later (after leaving NS):** move DNS to Cloudflare (free) or Vercel nameservers → wildcard `*.loyaltyuntapped.com` → per-client subdomains (`bartaco.loyaltyuntapped.com`) handled automatically by Next.js middleware reading the host header. The app's URL structure (`/p/[client]/[deck]`) is already shaped so this is a routing-layer change only — no data migration.

---

## 8. Pitfalls & gotchas (read before building)

1. **Dropbox will fight the dev environment.** `node_modules` + `.next` = hundreds of thousands of small synced files. Mark them ignored: `xattr -w com.dropbox.ignored 1 node_modules .next` (macOS; also keep them in `.gitignore`). If startup takes minutes or a generated chunk such as `./32.js` is missing, stop Next, move `.next` to a temporary backup, and restart.
2. **Vercel Hobby ToS** — non-commercial. Fine now; move to Pro when client-facing use is real.
3. **Clerk public-route matcher** — a wrong middleware matcher makes published decks demand login (or worse, leaves the editor open). Test both directions logged out.
4. **Neon cold starts** — first query after idle ~500ms. Don't chase this as a "bug" Thursday.
5. **Audio formats** — voice memos from iPhones are `.m4a`; accept mp3/m4a/wav and store as-is (all play natively in modern browsers). Don't build transcoding.
6. **Concurrent edits** — autosave is last-write-wins in v1. Two people editing the *same slide* can clobber each other. Mitigation shipped: `updated_at` check on save → "This slide changed since you loaded it" warning. Real-time collab is explicitly out of scope.
7. **Layout-change data loss** — the migration/confirm dialog (§3) exists precisely because silent content loss is the fastest way to lose team trust in the tool.
8. **DnD accessibility** — free-form canvas DnD is an a11y tarpit. The structured tree + visible move buttons means core ordering works without dragging. The current native DnD layer handles pointer-based cross-container moves; a dedicated keyboard cross-container interaction remains an accessibility follow-up.
9. **NS propagation delay** — the one task with an external clock. Front-load it.
10. **Blob URLs are public-but-unguessable** — fine for voiceovers on decks that go public anyway; don't put anything sensitive in audio.
11. **Never run production build and dev concurrently.** `next build` and `next dev` both write `.next`. In this Dropbox workspace, overlapping them produced a dev server that accepted TCP connections but returned no bytes, followed by missing webpack chunks. Stop dev before building; clear/move `.next` before restarting if the cache was shared.

---

## 9. Development sequence — reconciled August 11

| Status | Milestone | Remaining boundary |
|---|---|---|
| Complete | Foundation: repo, tokens/fonts, schema, Clerk, Neon, deployment | Public DNS is still pending |
| Complete | Dashboard, deck creation, slide persistence/management, editor shell, layouts, autosave | Client settings/CRUD beyond deck creation is still planned |
| Complete | Nested block editor, cross-container DnD, Outline, block library, media library, slide styles, SVG themes/masks | More real-world block/template coverage is needed |
| **Next** | Audit collected marketing decks and implement the prioritized reusable block/template set | Keep content-model additions compatible with Design, Outline, library snapshots, and future present mode |
| Complete | Voiceover upload, player, and manual caption cues | Uses the existing `voiceovers` schema and isolated Vercel Blob audio policy |
| In progress | MVP finish: review/status flow, public approved-deck route, DNS, end-to-end accessibility pass | Internal present mode is complete; keep public routes logged-out accessible |
| Post-MVP | Comments, client settings, merge tags, recording/transcription, analytics, PDF export | See parking lot below |

The original Thursday target remains aggressive. Protect the shared renderer and
data model first; reduce transition polish before cutting content accessibility,
safe saves, or public-route protections.

---

## 10. Post-MVP roadmap (parking lot)

In-browser voice recording · Whisper auto-transcription · threaded comments w/ email notifications · merge-tag personalization · live-synced library blocks · per-client subdomains · deck analytics (did the client open it? per-slide dwell) · PDF export for clients who ask for "the deck as a file" · passcode-protected published decks · move off Network Solutions 🎉
