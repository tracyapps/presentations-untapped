import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Presentations Untapped",
  description: "Loyalty Untapped internal pitch-deck builder",
  robots: { index: false, follow: false },
  icons: { icon: "/logos/lu-logomark.svg" },
};

/** Runs before paint so the saved (or OS-preferred) theme applies
 *  without a flash of the wrong mode. */
const themeInit = `(function(){try{var t=localStorage.getItem("lu-theme");if(!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  const shell = (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );

  // Clerk wraps the app only when keys exist, so the repo builds/runs
  // before accounts are set up. Remove the fallback once Clerk is live.
  return hasClerk ? <ClerkProvider>{shell}</ClerkProvider> : shell;
}
