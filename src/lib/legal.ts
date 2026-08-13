/**
 * The details that go in the legal pages, in one place.
 *
 * Both /legal/privacy and /legal/terms read from here, so filling these in
 * once updates both pages and the "last updated" line.
 *
 * ⚠️ These pages are a starting point written to satisfy Google's OAuth
 * verification requirement, not legal advice. Google checks that a privacy
 * policy is publicly reachable, hosted on your domain, and actually describes
 * how you handle Google user data — generic filler tends to fail review, so
 * the content is specific to what this app really does. Have someone qualified
 * read it before anything client-facing depends on it.
 */
export const LEGAL = {
  /** Legal entity name. Change if the operating company differs from the brand. */
  company: "Loyalty Untapped",
  product: "Presentations Untapped",

  
  contactEmail: "tech@loyaltyuntapped.com",
  /** TODO: get the address to add here */
  postalAddress: "",

  /** The state or country whose law governs the terms.  */
  governingLaw: "the State of Wisconsin, USA",

  /** Shown as "Last updated". Bump whenever the text changes. */
  lastUpdated: "August 13, 2026",

  appOrigin: "https://decks.loyaltyuntapped.com",
} as const;

/** Subprocessors — the third parties that touch data on our behalf. Naming
 *  them is both good practice and something reviewers look for. */
export const SUBPROCESSORS = [
  { name: "Clerk", purpose: "Account creation, sign-in, and session management" },
  { name: "Neon", purpose: "Database hosting for presentation content and company records" },
  { name: "Vercel", purpose: "Application hosting, content delivery, and file storage for images and audio" },
  { name: "Google", purpose: "Optional sign-in with a Google account" },
] as const;
