/**
 * One-time backfill for the LIBRARIES.md schema (§2.3, §2.5).
 *
 *   node --env-file=.env.local scripts/backfill-libraries.mjs [--apply]
 *
 * Default is a DRY RUN that prints what it would do and changes nothing.
 * Pass --apply to write. Idempotent either way: re-running only fills gaps.
 *
 * Does two things:
 *   1. Inserts a `media_assets` row for every existing Blob object under the
 *      `media/` prefix, so the media library can be tagged and attributed.
 *   2. Copies each `clients.contact_name/contact_email` pair into a primary
 *      `company_contacts` row. The legacy columns are left in place — they get
 *      dropped in a later migration once this is verified everywhere.
 *
 * Neither step deletes anything.
 */
import { list } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";
import policy from "../src/lib/media-policy.json" with { type: "json" };

const APPLY = process.argv.includes("--apply");
const label = APPLY ? "APPLY" : "DRY RUN";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Run with: node --env-file=.env.local scripts/backfill-libraries.mjs");
  process.exit(1);
}

const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim() || process.env.media_READ_WRITE_TOKEN?.trim();
const sql = neon(databaseUrl);

/** Mirrors the display-name logic in src/lib/data/media.ts so names match. */
function displayName(pathname) {
  const leaf = (pathname.split("/").at(-1) ?? pathname).replace(/^(?:[0-9a-f-]{36}--)+/i, "");
  try { return decodeURIComponent(leaf); } catch { return leaf; }
}

function mimeFromPathname(pathname) {
  const ext = pathname.toLowerCase().split(".").at(-1);
  switch (ext) {
    case "jpg": case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    default: return "application/octet-stream";
  }
}

/* ------------------------------------------------------------------ */
/* 1. media_assets                                                     */

async function backfillMedia() {
  if (!blobToken) {
    console.log("\n[media] No Blob token found — skipping. Set BLOB_READ_WRITE_TOKEN and re-run.");
    return;
  }

  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix: policy.prefix, limit: 1000, cursor, token: blobToken });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const existing = await sql`SELECT pathname FROM media_assets`;
  const known = new Set(existing.map((row) => row.pathname));
  const missing = blobs.filter((blob) => !known.has(blob.pathname));

  console.log(`\n[media] ${blobs.length} blobs under "${policy.prefix}", ${known.size} already in media_assets.`);
  console.log(`[media] ${missing.length} to insert.`);

  if (!missing.length) return;

  for (const blob of missing) {
    const name = displayName(blob.pathname);
    const mime = blob.contentType || mimeFromPathname(blob.pathname);
    console.log(`  ${APPLY ? "+" : "would add"} ${name}  (${(blob.size / 1024).toFixed(0)} KB, ${mime})`);
    if (!APPLY) continue;

    // uploaded_by is unknown for pre-existing assets; "backfill" is a readable
    // sentinel that will never collide with a Clerk user id.
    await sql`
      INSERT INTO media_assets (url, pathname, name, size, mime, uploaded_by, created_at, updated_at)
      VALUES (${blob.url}, ${blob.pathname}, ${name}, ${blob.size}, ${mime}, 'backfill',
              ${blob.uploadedAt.toISOString()}, ${blob.uploadedAt.toISOString()})
      ON CONFLICT (pathname) DO NOTHING
    `;
  }
}

/* ------------------------------------------------------------------ */
/* 2. company_contacts                                                 */

async function backfillContacts() {
  const candidates = await sql`
    SELECT c.id, c.name, c.contact_name, c.contact_email
    FROM clients c
    WHERE (c.contact_name IS NOT NULL AND c.contact_name <> '')
       OR (c.contact_email IS NOT NULL AND c.contact_email <> '')
  `;

  const withPrimary = await sql`
    SELECT DISTINCT client_id FROM company_contacts WHERE is_primary = true
  `;
  const done = new Set(withPrimary.map((row) => row.client_id));
  const pending = candidates.filter((row) => !done.has(row.id));

  console.log(`\n[contacts] ${candidates.length} companies have legacy contact data, ${done.size} already migrated.`);
  console.log(`[contacts] ${pending.length} to migrate.`);

  for (const row of pending) {
    // A company with only an email and no name still deserves a contact row;
    // the email is a better label than an empty string.
    const contactName = (row.contact_name || "").trim() || (row.contact_email || "").trim() || "Primary contact";
    console.log(`  ${APPLY ? "+" : "would add"} ${row.name} → ${contactName}${row.contact_email ? ` <${row.contact_email}>` : ""}`);
    if (!APPLY) continue;

    await sql`
      INSERT INTO company_contacts (client_id, name, email, is_primary, sort_order)
      VALUES (${row.id}, ${contactName}, ${row.contact_email || null}, true, 0)
    `;
  }
}

/* ------------------------------------------------------------------ */

console.log(`Library backfill — ${label}`);
if (!APPLY) console.log("Nothing will be written. Re-run with --apply once the plan below looks right.");

await backfillMedia();
await backfillContacts();

console.log(`\nDone (${label}).`);
if (!APPLY) console.log("Re-run with --apply to write these changes.");
