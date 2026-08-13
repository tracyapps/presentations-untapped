import Link from "next/link";
import { LEGAL } from "@/lib/legal";

/**
 * Shared shell for the legal pages.
 *
 * Deliberately standalone — no app header, no sign-in prompt. These have to be
 * readable by someone who has never logged in, including a Google OAuth
 * reviewer, and anything that looks like a login wall is a fail.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="legal-page">
      <article>
        <p className="eyebrow">{LEGAL.product}</p>
        {children}
        <footer className="legal-footer">
          <nav aria-label="Legal pages">
            <Link href="/legal/privacy">Privacy Policy</Link>
            <Link href="/legal/terms">Terms of Service</Link>
          </nav>
          <p>© {new Date().getFullYear()} {LEGAL.company}</p>
        </footer>
      </article>
    </main>
  );
}
