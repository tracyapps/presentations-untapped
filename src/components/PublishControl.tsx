"use client";

/**
 * The review and publishing control in the editor header (PLAN.md §5.7).
 *
 * Three states, one control. The important design decisions:
 *
 *  - Approving runs the pre-publish checks first and shows exactly what is
 *    wrong, per slide, rather than refusing with a generic error. There is an
 *    explicit "publish anyway" — the checks are advice, not a gate, because a
 *    hard block on alt text just teaches people to type "image".
 *  - The public URL is only shown once it actually works, and it is copyable in
 *    one click, because the next thing anyone does is paste it into an email.
 *  - Un-publishing is a confirmed, plainly-worded action: it 404s a link that
 *    may already be in a client's inbox.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { setDeckSlugAction, setDeckStatusAction, type DeckStatus } from "@/app/decks/publish-actions";

const LABEL: Record<DeckStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Published",
};

export default function PublishControl({
  deckId, status, clientSlug, deckSlug, publicOrigin,
}: {
  deckId: string;
  status: DeckStatus;
  clientSlug: string;
  deckSlug: string;
  /** e.g. https://decks.loyaltyuntapped.com — from env, falls back to origin. */
  publicOrigin?: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [issues, setIssues] = useState("");
  const [slug, setSlug] = useState(deckSlug);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const path = `/p/${clientSlug}/${slug}`;
  const [origin, setOrigin] = useState(publicOrigin ?? "");
  useEffect(() => {
    if (!publicOrigin) setOrigin(window.location.origin);
  }, [publicOrigin]);
  const fullUrl = `${origin}${path}`;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as globalThis.Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  function change(next: DeckStatus, force = false) {
    startTransition(async () => {
      const result = await setDeckStatusAction({ deckId, status: next, force });
      if (result.status === "blocked") {
        setIssues(result.issues);
        setMessage(result.message);
        return;
      }
      setIssues("");
      setMessage(result.message);
    });
  }

  function saveSlug() {
    startTransition(async () => {
      const result = await setDeckSlugAction({ deckId, slug });
      setMessage(result.message);
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage("Copying failed — select the link and copy it manually.");
    }
  }

  return (
    <div className="publish-control" ref={containerRef}>
      <button
        ref={triggerRef} type="button"
        className={`button button-secondary publish-trigger is-${status}`}
        aria-expanded={open} aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="publish-dot" aria-hidden="true" />
        {LABEL[status]}
        <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="publish-panel" role="dialog" aria-label="Review and publishing">
          <div className="publish-steps" role="group" aria-label="Deck status">
            {(["draft", "in_review", "approved"] as const).map((step) => (
              <button
                key={step} type="button"
                className={`publish-step${status === step ? " is-current" : ""}`}
                aria-pressed={status === step}
                aria-disabled={isPending}
                data-disabled={isPending || undefined}
                onClick={() => {
                  if (isPending || status === step) return;
                  if (step === "draft" && status === "approved"
                    && !window.confirm("Move back to draft? The public link stops working immediately, including for anyone who already has it.")) return;
                  change(step);
                }}
              >
                {LABEL[step]}
              </button>
            ))}
          </div>

          {message && <p className="publish-message" role="status">{message}</p>}

          {issues && (
            <div className="publish-issues">
              <strong>Before this goes to a client</strong>
              <pre>{issues}</pre>
              <div>
                <button type="button" className="button button-secondary" onClick={() => { setIssues(""); setMessage(""); }}>
                  Let me fix these
                </button>
                <button type="button" className="button button-primary" onClick={() => change("approved", true)}>
                  Publish anyway
                </button>
              </div>
            </div>
          )}

          <div className="publish-link">
            <label>
              <span>Public link</span>
              <span className="publish-slug">
                <i>/p/{clientSlug}/</i>
                <input
                  value={slug} maxLength={60}
                  onChange={(event) => setSlug(event.target.value)}
                  onBlur={() => { if (slug !== deckSlug) saveSlug(); }}
                />
              </span>
            </label>

            {status === "approved" ? (
              <div className="publish-live">
                <a href={path} target="_blank" rel="noreferrer">{fullUrl}</a>
                <button type="button" onClick={copy}>
                  {copied ? "Copied" : "Copy"}
                  <span className="sr-only"> public link</span>
                </button>
              </div>
            ) : (
              <p className="publish-hint">
                This link goes live when the deck is published, and returns a 404
                until then.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
