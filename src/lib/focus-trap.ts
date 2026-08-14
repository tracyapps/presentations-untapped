"use client";

/**
 * Keep Tab inside an open dialog.
 *
 * `aria-modal="true"` tells a screen reader the rest of the page is not there.
 * It does nothing at all for a sighted keyboard user, who can tab straight out
 * of the dialog and into a page they cannot see, with no way of knowing where
 * focus went. The attribute is a claim; this is the thing that makes it true.
 *
 * Deliberately queries on each Tab rather than caching the list: the media
 * library grows a thumbnail mid-dialog, the picker swaps an entire tab panel,
 * and a list captured on open would be wrong seconds later.
 */
import { useEffect, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled])",
  "select:not([disabled])", "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const root = ref.current;
      if (!root) return;

      const focusable = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
        // `inert` and display:none subtrees are still matched by the selector.
        .filter((node) => node.offsetParent !== null || node === document.activeElement)
        .filter((node) => !node.closest("[inert]"));
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;

      // Focus outside the dialog entirely (it was removed, or something stole
      // it) — put it back rather than letting Tab continue into the page.
      if (!(current instanceof HTMLElement) || !root.contains(current)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (!event.shiftKey && current === last) { event.preventDefault(); first.focus(); }
      if (event.shiftKey && current === first) { event.preventDefault(); last.focus(); }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [ref, active]);
}
