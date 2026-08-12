import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Not found",
  robots: { index: false, follow: false },
};

/**
 * The 404 a client sees.
 *
 * It deliberately does not distinguish "this deck does not exist" from "this
 * deck is no longer published" — the URL is shared by email and we should not
 * confirm the existence of anything to whoever ends up with the link. It also
 * does not link into the app: there is nothing here for a logged-out visitor.
 */
export default function PublicNotFound() {
  return (
    <main className="public-missing">
      <div>
        <p className="eyebrow">Loyalty Untapped</p>
        <h1>This presentation isn’t available</h1>
        <p>
          The link may have expired, or the presentation may have been taken down
          while it’s being updated. Please get in touch with your contact at
          Loyalty Untapped for a current link.
        </p>
      </div>
    </main>
  );
}
