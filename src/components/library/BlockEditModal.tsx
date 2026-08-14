"use client";

/**
 * The pop-out block editor — the "smart object" pattern (LIBRARIES.md §5.5).
 *
 * A library block is a source object. Double-clicking its preview opens it in a
 * real editing surface with the same canvas, chrome, and interactions as a deck,
 * and saving pushes back to the library. You never edit a library block by
 * accident, and you never have to open a deck to edit one.
 *
 * The save control is deliberately a **split button**:
 *
 *   - **Save changes** overwrites the source and bumps its version. Everything
 *     linked to this block picks the change up.
 *   - **Save as new version** forks a named variant under this parent. That is
 *     v2 (it needs the variant schema), but the control ships now, disabled with
 *     the reason and its naming field visible — because the whole point of
 *     versions is to stop people duplicating blocks, and they will only reach
 *     for versions if they can see that versions are where this is going.
 *
 * Media assignment is intentionally not wired here yet: the media picker is a
 * deck-scoped surface today. Image blocks keep their existing sources and their
 * geometry stays editable; swapping the image is done in a deck for now.
 */
import { useEffect, useRef, useState } from "react";
import SlideCanvas from "@/components/SlideCanvas";
import type { SlideCanvasEditor } from "@/components/SlideCanvas";
import type { ContentNode, Node, SlideDoc } from "@/lib/slides/types";
import {
  deleteNode, duplicateNode, moveNode, moveNodeTo, swapLayoutChildren,
} from "@/lib/slides/editor";

type Props = {
  name: string;
  version: number;
  node: Node;
  usageCount: number;
  onCancel: () => void;
  onSave: (node: Node) => Promise<{ status: string; message?: string }>;
};

/** The block is edited as a one-node document so it can reuse SlideCanvas
 *  verbatim. No surface or pattern: a block previews and edits bare. */
function toDoc(node: Node): SlideDoc {
  return { version: 1, blocks: [structuredClone(node)] };
}

/** Walks Nodes (not just ContentNodes) so layout blocks get settings too. */
function mapAnyNode(nodes: Node[], id: string, update: (node: Node) => Node): Node[] {
  return nodes.map((node) => {
    if (node.id === id) return update(node);
    return node.kind === "layout" ? { ...node, children: mapAnyNode(node.children, id, update) } : node;
  });
}

function replaceNode(nodes: Node[], id: string, update: (node: ContentNode) => ContentNode): Node[] {
  return nodes.map((node) => {
    if (node.kind === "layout") return { ...node, children: replaceNode(node.children, id, update) };
    return node.id === id ? update(node) : node;
  });
}

export default function BlockEditModal({
  name, version, node, usageCount, onCancel, onSave,
}: Props) {
  const [doc, setDoc] = useState<SlideDoc>(() => toDoc(node));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const [variantName, setVariantName] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  /* --------------------------- Focus handling -------------------------- */

  /* Mount-only: take focus once, lock the page behind, restore on close.
     Deliberately separate from the key handler below — folding them together
     would re-run this on every keystroke and yank focus out of whatever text
     the person is editing. */
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, []);

  /* Escape and the Tab cycle. Re-registered as state changes, which is fine —
     it only swaps a listener, it does not move focus. */
  useEffect(() => {
    function focusables(): HTMLElement[] {
      return [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((element) => element.offsetParent !== null);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        if (saveMenuOpen) { setSaveMenuOpen(false); return; }
        requestCancel();
        return;
      }
      if (event.key !== "Tab") return;

      // aria-modal alone does not stop Tab reaching the page behind.
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialogRef.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault(); first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveMenuOpen, dirty]);

  function requestCancel() {
    if (dirty && !window.confirm("Discard your changes to this block?")) return;
    onCancel();
  }

  /* ------------------------------ Editing ------------------------------ */

  function mutate(next: SlideDoc) {
    setDoc(next);
    setDirty(true);
    setError("");
  }

  const editor: SlideCanvasEditor = {
    onDelete: (target) => {
      // The root node IS the block. Deleting it would leave nothing to save.
      if (doc.blocks[0]?.id === target.id) {
        setError("This is the block itself. Delete it from the library instead.");
        return;
      }
      if (!window.confirm("Delete this block from the group?")) return;
      mutate(deleteNode(doc, target.id));
    },
    onDuplicate: (target) => mutate(duplicateNode(doc, target.id)),
    onMove: (target, direction) => mutate(moveNode(doc, target.id, direction)),
    onDrop: (sourceId, target) => mutate(moveNodeTo(doc, sourceId, target.parentId, target.index)),
    onSwapColumns: (target) => mutate(swapLayoutChildren(doc, target.id)),
    onUpdateProps: (id, props) => mutate({
      ...doc,
      blocks: replaceNode(doc.blocks, id, (current) => (
        { ...current, props: props as typeof current.props } as ContentNode
      )),
    }),
    onUpdateLayout: (id, layout) => mutate({
      ...doc,
      blocks: mapAnyNode(doc.blocks, id, (current) => {
        const next = { ...current };
        if (Object.values(layout).every((value) => value === undefined)) delete next.layout;
        else next.layout = layout;
        return next;
      }),
    }),
    onUpdateSurface: (id, surface) => mutate({
      ...doc,
      blocks: mapAnyNode(doc.blocks, id, (current) => {
        const next = { ...current };
        if (!surface || surface === "inherit") delete next.style;
        else next.style = { ...next.style, surface };
        return next;
      }),
    }),
    onTransformImage: (id, update) => mutate({
      ...doc,
      blocks: replaceNode(doc.blocks, id, (current) => (
        current.type === "image" ? { ...current, props: { ...current.props, ...update } } : current
      )),
    }),
    // Saving from inside the source editor would be circular.
    onSaveToLibrary: () => setError("You are already editing the library copy of this block."),
    onEditImage: () => setError("Swapping an image is done in a deck for now. Position, crop, and rotation work here."),
    onAssignMedia: () => setError("Swapping an image is done in a deck for now."),
    onAddFloatingMedia: () => setError("Adding new media is done in a deck for now."),
  };

  /* ------------------------------- Saving ------------------------------ */

  async function save() {
    const edited = doc.blocks[0];
    if (!edited) { setError("There is nothing left to save."); return; }

    setSaving(true);
    const result = await onSave(edited);
    setSaving(false);
    if (result.status === "error") { setError(result.message ?? "That did not save."); return; }
    setDirty(false);
  }

  return (
    <div className="lib-editor-backdrop" onPointerDown={(event) => {
      if (event.target === event.currentTarget) requestCancel();
    }}>
      <div
        className="lib-editor" role="dialog" aria-modal="true"
        aria-labelledby="block-editor-title" ref={dialogRef} tabIndex={-1}
      >
        <header className="lib-editor-head">
          <div>
            <p className="eyebrow">Editing library block</p>
            <h2 id="block-editor-title">{name}</h2>
            <p className="lib-editor-blast">
              Version {version} ·{" "}
              {usageCount > 0
                ? `Saving updates this block in ${usageCount} ${usageCount === 1 ? "deck" : "decks"}.`
                : "Not used in any deck yet."}
            </p>
          </div>

          <div className="lib-editor-actions">
            <button type="button" className="button button-secondary" onClick={requestCancel}>
              Cancel
            </button>

            {/* Split button: the primary path overwrites, the menu is where
                versioning lives. Both visible from the start so the pattern is
                learned before variants actually exist. */}
            <div className="lib-split">
              <button
                type="button" className="button button-primary"
                aria-disabled={!dirty || saving} data-disabled={!dirty || saving || undefined}
                onClick={() => dirty && !saving && save()}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button" className="button button-primary lib-split-toggle"
                aria-expanded={saveMenuOpen} aria-haspopup="menu"
                onClick={() => setSaveMenuOpen((open) => !open)}
              >
                <span aria-hidden="true">▾</span>
                <span className="sr-only">More save options</span>
              </button>

              {saveMenuOpen && (
                <div className="lib-split-menu" role="menu">
                  <button
                    type="button" role="menuitem" className="lib-split-item"
                    aria-disabled={!dirty || saving} data-disabled={!dirty || saving || undefined}
                    onClick={() => { if (dirty && !saving) { setSaveMenuOpen(false); save(); } }}
                  >
                    <strong>Save changes</strong>
                    <span>Overwrites this block everywhere it is used. Version becomes {version + 1}.</span>
                  </button>

                  <div className="lib-split-item is-soon" aria-disabled="true">
                    <strong>Save as new version</strong>
                    <span>
                      Keeps the original and files this alongside it as a named
                      variation. Decks then choose which version they use.
                    </span>
                    <label>
                      <span className="sr-only">Version name</span>
                      <input
                        value={variantName} placeholder="e.g. Short version, Q4 wording"
                        aria-disabled="true" readOnly
                        onChange={(event) => setVariantName(event.target.value)}
                      />
                    </label>
                    <em>Coming in v2 — versions need the variant schema first.</em>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {error && <p className="lib-editor-error" role="status">{error}</p>}

        <div className="lib-editor-canvas">
          {/* The same canvas as a deck, so every editing interaction people
              already know works here unchanged. */}
          <SlideCanvas doc={doc} theme="light" editor={editor} />
        </div>

        <p className="lib-editor-note">
          This is the source block. Changes here are not part of any one deck —
          they change the block itself.
        </p>
      </div>
    </div>
  );
}
