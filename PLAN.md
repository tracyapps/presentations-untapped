# Presentations Untapped — Technical Plan

Internal tool for spinning up client pitch decks: block-based slide editor, reusable library, per-slide voiceovers with captions, internal draft review, and one-click publishing to a public URL under loyaltyuntapped.com.

**Deadline: usable by Thursday EOD (Aug 13, 2026).** Phasing below is built around that.

---

## 1. Stack (decided)

| Layer | Choice | Cost | Why |
|---|---|---|---|
| Framework | Next.js 15 (App Router, TypeScript) | free | One codebase for editor app + public published decks; server components keep the public decks fast/simple |
| Hosting | Vercel | free (Hobby) | Zero-config deploys, custom domains. ⚠️ Hobby plan is licensed for *non-commercial* use — fine while pre-revenue, budget $20/mo Pro once clients land |
| Database | Neon Postgres (free tier) | free | 0.5GB is plenty; branchable for testing. ⚠️ autosuspends when idle → first query after a lull takes ~500ms. Acceptable for an internal tool |
| ORM | Drizzle | free | Type-safe, lightweight, plays well with Neon serverless driver |
| Auth | Clerk (free tier, invite-only) | free to 10k MAU | Decided. Drop-in `<SignIn/>`, org invites, no SSO needed. Disable public sign-ups; team members are invited by email from the Clerk dashboard |
| File storage (audio, logos) | Vercel Blob | free tier | Simplest integration. Migrate to Cloudflare R2 (10GB free) if we outgrow it |
| Rich text (basic formatting) | TipTap (core, free) | free | Bold/italic/underline/size only; trimmed extension set. Color deliberately NOT exposed — theme tokens own color |
| Drag & drop | dnd-kit | free | Best keyboard/screen-reader story of the React DnD libs (built-in keyboard sensor + announcements) |
| Editor state | Zustand + debounced autosave | free | Simple, no boilerplate |

**Total running cost today: $0.** First real cost is Vercel Pro ($20/mo) when the tool is used commercially in earnest.

### Accounts you (tapps) need to create — ~15 min, I can't do these for you
1. **Vercel** — vercel.com, sign up with GitHub (create a free GitHub account/repo for this project if you don't have one you want to use — Vercel deploys from git).
2. **Neon** — neon.tech, create project `presentations-untapped`, copy the connection string.
3. **Clerk** — clerk.com, create application, **disable sign-ups** (Restrictions → Sign-up mode: Restricted), copy publishable + secret keys.
4. Paste all keys into `.env.local` (template provided in repo) and into Vercel → Project → Environment Variables.

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
type SlideDoc = { version: 1; blocks: Node[] };
type Node = LayoutNode | ContentNode;

type LayoutNode = {
  id: string;                       // nanoid
  kind: "layout";
  type: "row" | "columns" | "grid" | "group";
  props: { cols?: number; gap?: string; align?: string };
  children: Node[];
};

type ContentNode = {
  id: string;
  kind: "content";
  type: "title" | "tagline" | "blockquote" | "callout" | "paragraph"
      | "image" | "list" | "statCard" | "table" | "pricingTable" | "chart";
  props: Record<string, unknown>;   // per-type: rich-text JSON, src/alt, table cells, stat values…
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
/decks/[id]/present       → internal present mode (works for draft decks too — for virtual calls)
/clients                  → client list + settings panel (details, notes, events)  [minimal Thu, full Fri]
/library                  → manage saved blocks/slides
/p/[clientSlug]/[deckSlug]→ PUBLIC published deck (approved only) — served at decks.loyaltyuntapped.com/[clientSlug]/[deckSlug]
```

Clerk middleware protects everything except `/p/**` (and static assets). **Gotcha:** getting the public matcher right is a classic Clerk footgun — test logged-out access to a published deck explicitly.

---

## 5. Feature specs

### 5.1 Dashboard (req #8)
Grid (thumbnail cards) and table (list) views, toggle persisted per user (localStorage). Group-by-client sections; search across deck title + client name; sort by created/modified. Thumbnails: render slide 1 small from the block tree (a real DOM render scaled down — no image generation needed).

### 5.2 Editor — three tabs (req #11–19)

**Shared chrome:** tabs (Design / Outline / Voiceover), "editing slide N of M", `+` add slide, slide strip/switcher, layout dropdown (visual previews), split SAVE button (Save / Save & close / Save & new slide / Save as duplicate), Cancel, unsaved-changes indicator, autosave (debounced ~2s after last change; save button disables when clean; `beforeunload` guard when dirty).

**Design view:** left panel = layout blocks + content blocks palette (click-to-add always works; drag-to-position is the enhancement). Right = slide frame at fixed 1280×720 design resolution, scaled to fit via `transform: scale()`.
> Note on req #13: rather than per-element `clamp()`, the whole slide renders at full design size and is uniformly scaled with a CSS transform. This keeps *every* size relationship pixel-accurate at any zoom — same technique Keynote/Figma use — and present mode is just the same render at scale-to-viewport. Less CSS to maintain, impossible for text contrast to drift.

Every block gets **always-visible chrome** (req #14): a thin outline + mini header bar (block name, drag handle, ⋮ menu: duplicate / save to library / delete, and move ▲▼ buttons). Styled subtle (borders at ~40% using `--border-default`) but never hidden. Keyboard: blocks focusable, ▲▼ move within parent, dnd-kit keyboard sensor for cross-container moves.

**Outline view (req #19):** same left palette; right side renders the same tree as nested labeled boxes (ROW → COLUMN → TEXT, per wireframe p.2) with plain text fields/textareas + minimal formatting toolbar (bold/italic/underline/size — no color, ever). Because both views edit the same tree, toggling is lossless.

**Voiceover view (req #21):** left = upload zone (mp3/m4a/wav, soft 25MB cap) + clip info + delete/replace; right = player preview exactly as it will appear on the published slide, plus the **caption cue editor**: table of rows (start / end / text), "＋ cue at playhead" button, inline validation (overlaps/ordering). This *is* the manual transcription editor (auto-transcription later feeds the same rows).

### 5.3 Voiceover player (req #4) — one component reused in editor preview, present mode, and public decks
Big circular play button showing clip length → expands to transport: play/pause, back 10s, forward 10s, seekable timeline (a real `<input type=range>` — accessible by default), current/total time, CC toggle. Captions render in a live region below the slide, styled by tokens. `<audio preload="metadata">`, keyboard operable, visible focus states.

### 5.4 Library (req #20)
Save **from** the editor: block ⋮ menu → "Save to library" (names it, snapshots the subtree); slide-level "Save slide to library" in the deck menu. Insert **into** a deck: "Library" tab in the left palette alongside Layout/Content blocks (searchable, previews). Management screen at `/library` for rename/delete/edit. Pattern follows the best-of-breed reference (Notion synced-block-style saving *from context*, Canva-style palette insertion). Library inserts are **copies** (no live-sync in v1 — flagged as future enhancement).

### 5.5 Present mode (req #3)
Dead simple: full-screen slide (Fullscreen API + fallback), ← → / space / click to advance, `Esc`/`G` for **overview grid** (all slides, click to jump), slide counter, theme toggle, voiceover player if present. Same renderer as the editor frame at viewport scale. `prefers-reduced-motion` respected (no slide transitions when set). Works for internal drafts and is identical to what an emailed client sees on the public URL — zero learning curve.

### 5.6 Publishing + status flow
`draft → in_review → approved`. Approving prompts to confirm the public slug and sets `published_at`; the deck is then live at `decks.loyaltyuntapped.com/[client]/[deck]`. Un-approving (back to draft) 404s the public URL. Public pages: no auth, `noindex` robots meta (decks are for clients, not Google), OG tags with deck title + client/event branding for nice link previews in email.

### 5.7 Review comments (Friday+, schema ships Thursday)
Comment affordance on each slide and on each block (via ⋮ menu) → threaded panel (parent_id threading, resolve/unresolve, author + timestamp from Clerk). Deck-level "Request review" flips status to `in_review` and surfaces a review banner to other users.

### 5.8 Client personalization (Phase 2, cheap win)
Merge tags in text blocks — `{{client.name}}`, `{{event.name}}` — resolved at render. Makes library slides self-personalizing when dropped into any client's deck.

---

## 6. Theming & accessibility (non-negotiables)

- Tokens only; no hardcoded colors. `data-theme="dark"` on `<html>`, toggle in editor chrome AND present/public views (req #7), default = deck's `theme_default`, respects `prefers-color-scheme` on first visit, persisted in localStorage.
- WCAG 2.1 AA targets: full keyboard operability (block moves, slide nav, player), focus visible everywhere, `aria-live` announcements for autosave status + dnd moves + caption text, alt text enforced on images, contrast checked in both themes (the token system was already built for this), reduced-motion respected.
- All destructive actions (delete slide, delete block, layout change with loss, un-publish) get explicit confirmation dialogs (req #17, #18).

---

## 7. DNS / publishing runbook (Network Solutions, manual — do this TUESDAY, not Thursday)

One-time setup, ~10 minutes, then publishing is fully automatic forever:

1. In Vercel → Project → Settings → Domains → add `decks.loyaltyuntapped.com`.
2. Vercel shows a CNAME target (`cname.vercel-dns.com`).
3. Network Solutions → Account Manager → Domain → **Manage DNS / Advanced DNS** → Add record: Type `CNAME`, Host `decks`, Points to `cname.vercel-dns.com`, TTL lowest offered.
4. Wait for propagation (usually minutes; NS can take hours — hence Tuesday). Vercel auto-issues the SSL cert once it resolves.

**Later (after leaving NS):** move DNS to Cloudflare (free) or Vercel nameservers → wildcard `*.loyaltyuntapped.com` → per-client subdomains (`bartaco.loyaltyuntapped.com`) handled automatically by Next.js middleware reading the host header. The app's URL structure (`/p/[client]/[deck]`) is already shaped so this is a routing-layer change only — no data migration.

---

## 8. Pitfalls & gotchas (read before building)

1. **Dropbox will fight the dev environment.** `node_modules` + `.next` = hundreds of thousands of small synced files. Mark them ignored *before* first install: `xattr -w com.dropbox.ignored 1 node_modules .next` (macOS; also add to `.gitignore`). Otherwise expect fans, sync backlog, and possible file-lock weirdness during builds.
2. **Vercel Hobby ToS** — non-commercial. Fine now; move to Pro when client-facing use is real.
3. **Clerk public-route matcher** — a wrong middleware matcher makes published decks demand login (or worse, leaves the editor open). Test both directions logged out.
4. **Neon cold starts** — first query after idle ~500ms. Don't chase this as a "bug" Thursday.
5. **Audio formats** — voice memos from iPhones are `.m4a`; accept mp3/m4a/wav and store as-is (all play natively in modern browsers). Don't build transcoding.
6. **Concurrent edits** — autosave is last-write-wins in v1. Two people editing the *same slide* can clobber each other. Mitigation shipped: `updated_at` check on save → "This slide changed since you loaded it" warning. Real-time collab is explicitly out of scope.
7. **Layout-change data loss** — the migration/confirm dialog (§3) exists precisely because silent content loss is the fastest way to lose team trust in the tool.
8. **DnD accessibility** — free-form canvas DnD is an a11y tarpit. The structured tree + visible move buttons means the app is *fully usable with zero drag and drop*; dnd-kit is layered on top as an enhancement. This is also the Thursday de-risk (see §9).
9. **NS propagation delay** — the one task with an external clock. Front-load it.
10. **Blob URLs are public-but-unguessable** — fine for voiceovers on decks that go public anyway; don't put anything sensitive in audio.
11. **`transform: scale()` + TipTap** — text cursor placement inside a scaled container can feel off in some browsers. Mitigation: Design view edits text in place at ≥0.5 scale (fine), Outline view is the unscaled text-editing surface. If cursor jank appears, we point users at Outline for long typing sessions.

---

## 9. Timeline to Thursday EOD

| Day | Ship | Fallback if slipping |
|---|---|---|
| **Mon (today)** | Plan ✅, repo scaffold, tokens + fonts + light/dark, DB schema + types, Clerk wiring, deploy skeleton to Vercel. **You:** create the 3 accounts (§1), add the NS CNAME | — |
| **Tue** | Dashboard (grid/table/search/sort), clients + events CRUD (minimal), deck create flow, editor shell (tabs, slide strip, save states), Design view: palette, click-to-add, block chrome, move ▲▼, layouts + confirm dialog, autosave | DnD slips to Wed — click-to-add + move buttons are fully functional |
| **Wed** | Outline view, dnd-kit layering, library (save-from-editor + insert palette + manage page), voiceover upload + player + caption editor | Library manage page slips to Thu AM (save/insert is the critical path) |
| **Thu** | Present mode (fullscreen + overview), publish flow + public routes, seed the first real deck, a11y + both-themes pass, deploy | If present mode is tight: public route reuses it, so it's ONE renderer — cut slide transitions, not features |
| **Fri+** | Comments/threads, full client notes panel, merge tags, in-browser recording (MediaRecorder), Whisper auto-transcription (~$0.006/min, feeds the same cue rows), R2 migration if needed, per-client subdomains after DNS move | |

**Honest risk assessment:** the schedule is aggressive but real, *because* the three views share one renderer/tree and DnD is an enhancement rather than a foundation. The most likely Thursday casualty is polish on the caption cue editor (functional but plain). Biggest external dependency: your 15 min of account setup + the NS DNS record — both needed by Tuesday.

---

## 10. Post-MVP roadmap (parking lot)

In-browser voice recording · Whisper auto-transcription · threaded comments w/ email notifications · merge-tag personalization · live-synced library blocks · per-client subdomains · deck analytics (did the client open it? per-slide dwell) · PDF export for clients who ask for "the deck as a file" · passcode-protected published decks · move off Network Solutions 🎉
