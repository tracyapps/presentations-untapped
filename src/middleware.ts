import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/** PUBLIC routes — published decks and the sign-in screen.
 *  ⚠️ Test this logged-out in BOTH directions (see PLAN.md §8.3):
 *  /p/... must load without auth; everything else must redirect. */
const isPublicRoute = createRouteMatcher(["/p(.*)", "/sign-in(.*)"]);

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
