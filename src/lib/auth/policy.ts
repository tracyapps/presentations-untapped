/**
 * The single switch point for permissions (LIBRARIES.md §2.8).
 *
 * In v1 every capability returns true and the UI renders everything. Components
 * are still written to call `can()` and to render real disabled states, so
 * turning permissions on in v2 means filling in this one function — no component
 * rewrites, no migration. Roles are already stored in `user_roles`.
 *
 * Keep this module free of imports from the database or React so it stays
 * testable and usable from both server actions and client components.
 */

export type Role = "admin" | "approver" | "editor" | "viewer";

export type Capability =
  | "library.create"
  | "library.edit"
  | "library.delete"
  | "library.approve"
  | "library.unlock"
  | "slide.editGlobal"
  | "variable.manage"
  | "company.edit"
  | "company.delete"
  | "deck.publish";

export type Actor = {
  userId: string;
  role: Role;
};

/**
 * The v2 matrix, written down now while the reasoning is fresh. It is NOT
 * consulted in v1 — `can()` short-circuits above it — but it documents intent
 * and gives the v2 change a starting point rather than a blank page.
 */
export const ROLE_CAPABILITIES: Record<Role, Capability[] | "*"> = {
  admin: "*",
  approver: [
    "library.create", "library.edit", "library.delete", "library.approve",
    "library.unlock", "slide.editGlobal", "variable.manage",
    "company.edit", "deck.publish",
  ],
  editor: [
    "library.create", "library.edit", "company.edit", "deck.publish",
  ],
  viewer: [],
};

/** Flip to `false` to enforce ROLE_CAPABILITIES. This is the v2 switch. */
export const PERMISSIONS_OPEN = true;

export function can(actor: Actor | null | undefined, capability: Capability): boolean {
  if (PERMISSIONS_OPEN) return true;
  if (!actor) return false;
  const allowed = ROLE_CAPABILITIES[actor.role];
  return allowed === "*" || allowed.includes(capability);
}

/**
 * Why an action is unavailable, for the disabled control's tooltip and
 * accessible description. Returns null when the action is available — a
 * disabled control without a stated reason is the thing that makes people
 * think the app is broken.
 */
export function denialReason(actor: Actor | null | undefined, capability: Capability): string | null {
  if (can(actor, capability)) return null;
  if (!actor) return "Sign in to do this.";
  return `Your role (${actor.role}) cannot ${capability.replace(".", " ")}.`;
}

export const DEFAULT_ROLE: Role = "editor";
