import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import ThemeToggle from "@/components/ThemeToggle";

export default function AppHeader() {
  return (
    <header className="app-header">
      <Link className="brand" href="/decks" aria-label="Presentations Untapped dashboard">
        {/* The logomark is decorative because the adjacent text names the product. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/lu-logomark.svg" alt="" width={40} height={40} />
        <span>Presentations Untapped</span>
      </Link>
      <div className="header-actions">
        <nav className="app-nav" aria-label="Workspace"><Link href="/decks">Decks</Link><Link href="/library">Library</Link></nav>
        <ThemeToggle />
        <UserButton />
      </div>
    </header>
  );
}
