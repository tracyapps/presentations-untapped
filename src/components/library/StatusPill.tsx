import { BLOCK_STATUS_GLYPHS, BLOCK_STATUS_LABELS } from "./block-catalog";
import type { LibraryStatus } from "@/lib/data/library";

/** Status is never colour-only: each state carries its own text and glyph so it
 *  survives greyscale, colour blindness, and a screen reader. Shared by the
 *  library page, the picker modal, and the editor sidebar so one block never
 *  looks approved in one place and draft in another. */
export default function StatusPill({ status }: { status: LibraryStatus }) {
  return (
    <span className="lib-status-pill" data-status={status}>
      <span aria-hidden="true">{BLOCK_STATUS_GLYPHS[status]}</span>{BLOCK_STATUS_LABELS[status]}
    </span>
  );
}
