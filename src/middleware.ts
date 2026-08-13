import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/** PUBLIC routes — published decks, the sign-in screen, and the legal pages.
 *  ⚠️ Test this logged-out in BOTH directions (see PLAN.md §8.3):
 *  /p/... must load without auth; everything else must redirect.
 *  /legal/... must stay public: Google's OAuth review fetches the privacy
 *  policy without a session, and anything resembling a login wall fails it. */
const isPublicRoute = createRouteMatcher(["/p(.*)", "/sign-in(.*)", "/legal(.*)"]);

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default hasClerk
  ? clerkMiddleware(async (auth, req) => {
      if (!isPublicRoute(req)) await auth.protect();
    })
  : function middleware() {
      return NextResponse.next(); // pre-Clerk fallback: everything open (local dev only)
    };

export const config = {
  matcher: [
    "/((?!_next|fonts|logos|favicon|.*\\.(?:svg|png|jpg|jpeg|woff2|ico|css|js)$).*)",
    "/(api|trpc)(.*)",
  ],
};
