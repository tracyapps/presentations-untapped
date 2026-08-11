"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addSlideAction, deleteSlideAction, duplicateSlideAction, saveSlideAction, type SaveSlideResult,
} from "@/app/decks/[id]/edit/actions";
import SlideCanvas from "@/components/SlideCanvas";
import type { EditorDeck, EditorSlide } from "@/lib/data/editor";
import { LAYOUTS, migrateToLayout } from "@/lib/slides/layouts";
import { appendContent, deleteNode, duplicateNode, moveNode, reorderNode } from "@/lib/slides/editor";
import type { ContentNode, ContentType, Node, RichText } from "@/lib/slides/types";
import { isLayout } from "@/lib/slides/types";

type Tab = "design" | "outline" | "voiceover";
type SaveState = "saved" | "dirty" | "saving" | "conflict" | "error";
type TextNode = Extract<ContentNode, { type: "title" | "tagline" | "blockquote" | "callout" | "paragraph" }>;

const CONTENT_PALETTE: Array<{ type: ContentType; label: string }> = [
  { type: "title", label: "Title" }, { type: "tagline", label: "Tagline" },
  { type: "paragraph", label: "Paragraph" }, { type: "blockquote", label: "Quote" },
  { type: "callout", label: "Callout" }, { type: "image", label: "Image" },
  { type: "list", label: "List" }, { type: "statCard", label: "Stat card" },
  { type: "table", label: "Table" }, { type: "pricingTable", label: "Pricing" },
  { type: "chart", label: "Chart" },
];

function isTextNode(node: ContentNode): node is TextNode {
  return ["title", "tagline", "blockquote", "callout", "paragraph"].includes(node.type);
}

function replaceNode(nodes: Node[], id: string, update: (node: ContentNode) => ContentNode): Node[] {
  return nodes.map((node) => {
    if (node.id === id && !isLayout(node)) return update(node);
    if (isLayout(node)) return { ...node, children: replaceNode(node.children, id, update) };
    return node;
  });
}

function plainText(value: RichText): string {
  return value.map((part) => part.text).join("");
}

export default function SlideEditor({ deck, initialSlide }: { deck: EditorDeck; initialSlide: EditorSlide }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("design");
  const [doc, setDoc] = useState(initialSlide.blocks);
  const [savedDoc, setSavedDoc] = useState(initialSlide.blocks);
  const [layoutKey, setLayoutKey] = useState(initialSlide.layoutKey);
  const [savedLayoutKey, setSavedLayoutKey] = useState(initialSlide.layoutKey);
  const [updatedAt, setUpdatedAt] = useState(initialSlide.updatedAt);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [message, setMessage] = useState("");
  const [isAdding, startAdding] = useTransition();
  const docRef = useRef(doc);
  const layoutRef = useRef(layoutKey);
  const savingRef = useRef(false);
  const dirty = useMemo(
    () => layoutKey !== savedLayoutKey || JSON.stringify(doc) !== JSON.stringify(savedDoc),
    [doc, layoutKey, savedDoc, savedLayoutKey],
  );

  useEffect(() => { docRef.current = doc; }, [doc]);
  useEffect(() => { layoutRef.current = layoutKey; }, [layoutKey]);
  useEffect(() => { if (dirty && saveState === "saved") setSaveState("dirty"); }, [dirty, saveState]);

  async function save(snapshot = docRef.current, snapshotLayout = layoutRef.current): Promise<SaveSlideResult | null> {
    if (savingRef.current) return null;
    savingRef.current = true;
    setSaveState("saving");
    setMessage("");
    try {
      const result = await saveSlideAction({
        deckId: deck.id,
        slideId: initialSlide.id,
        expectedUpdatedAt: updatedAt,
        layoutKey: snapshotLayout,
        blocks: snapshot,
      });
      if (result.status === "saved") {
        setUpdatedAt(result.updatedAt);
        setSavedDoc(snapshot);
        setSavedLayoutKey(snapshotLayout);
        setSaveState(
          layoutRef.current === snapshotLayout && JSON.stringify(docRef.current) === JSON.stringify(snapshot)
            ? "saved" : "dirty",
        );
      } else {
        setSaveState(result.status);
        setMessage(result.message);
      }
      return result;
    } catch {
      const result: SaveSlideResult = {
        status: "error",
        message: "The development server briefly disconnected. Your changes are still in this tab; try Save again.",
      };
      setSaveState(result.status);
      setMessage(result.message);
      return result;
    } finally {
      savingRef.current = false;
    }
  }

  useEffect(() => {
    if (!dirty || (saveState !== "dirty" && saveState !== "saved")) return;
    const timer = window.setTimeout(() => { void save(docRef.current); }, 2000);
    return () => window.clearTimeout(timer);
  // `save` deliberately reads the latest values from refs after the debounce.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, dirty, saveState]);

  useEffect(() => {
    function guard(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  function updateText(id: string, text: string) {
    if (saveState !== "conflict") {
      setSaveState("dirty");
      setMessage("");
    }
    setDoc((current) => ({
      ...current,
      blocks: replaceNode(current.blocks, id, (node) => {
        if (!isTextNode(node)) return node;
        const marks = node.props.text[0] ?? { text: "" };
        return { ...node, props: { ...node.props, text: [{ ...marks, text }] } } as ContentNode;
      }),
    }));
  }

  function updateNode(id: string, update: (node: ContentNode) => ContentNode) {
    if (saveState !== "conflict") {
      setSaveState("dirty");
      setMessage("");
    }
    setDoc((current) => ({ ...current, blocks: replaceNode(current.blocks, id, update) }));
  }

  function markDoc(next: ReturnType<typeof appendContent>) {
    if (saveState !== "conflict") {
      setSaveState("dirty");
      setMessage("");
    }
    setDoc(next);
  }

  function addBlock(type: ContentType) {
    markDoc(appendContent(docRef.current, type));
  }

  function changeLayout(targetKey: string) {
    if (targetKey === layoutRef.current) return;
    const migration = migrateToLayout(docRef.current, targetKey);
    if (migration.dropped.length) {
      const names = migration.dropped.map((node) => node.type).join(", ");
      if (!window.confirm(`Changing layout will remove ${migration.dropped.length} block${migration.dropped.length === 1 ? "" : "s"}: ${names}. Continue?`)) return;
    }
    setLayoutKey(targetKey);
    markDoc(migration.doc);
  }

  function removeBlock(node: Node) {
    if (!window.confirm(`Delete this ${node.type} block?`)) return;
    markDoc(deleteNode(docRef.current, node.id));
  }

  function confirmNavigate(event: React.MouseEvent) {
    if (dirty && !window.confirm("Leave before your latest changes are saved?")) event.preventDefault();
  }

  function addSlide() {
    startAdding(async () => {
      try {
        if (dirty) {
          const saved = await save();
          if (!saved || saved.status !== "saved") return;
        }
        const result = await addSlideAction(deck.id);
        if (result.status === "error") {
          setSaveState("error"); setMessage(result.message); return;
        }
        router.push(`/decks/${deck.id}/edit/${result.position}`);
        router.refresh();
      } catch {
        setSaveState("error");
        setMessage("The development server briefly disconnected. Try adding the slide again.");
      }
    });
  }

  function duplicateCurrentSlide() {
    startAdding(async () => {
      try {
        if (dirty) {
          const saved = await save();
          if (!saved || saved.status !== "saved") return;
        }
        const result = await duplicateSlideAction(deck.id, initialSlide.id);
        if (result.status === "error") {
          setSaveState("error"); setMessage(result.message); return;
        }
        router.push(`/decks/${deck.id}/edit/${result.position}`);
        router.refresh();
      } catch {
        setSaveState("error");
        setMessage("The development server briefly disconnected. Try duplicating the slide again.");
      }
    });
  }

  function deleteCurrentSlide() {
    if (!window.confirm(`Delete slide ${initialSlide.position}? This cannot be undone.`)) return;
    startAdding(async () => {
      try {
        const result = await deleteSlideAction(deck.id, initialSlide.id);
        if (result.status === "error") {
          setSaveState("error"); setMessage(result.message); return;
        }
        router.push(`/decks/${deck.id}/edit/${result.position}`);
        router.refresh();
      } catch {
        setSaveState("error");
        setMessage("The development server briefly disconnected. Try deleting the slide again.");
      }
    });
  }

  const stateLabel: Record<SaveState, string> = {
    saved: "Saved",
    dirty: "Unsaved changes",
    saving: "Saving…",
    conflict: "Save conflict",
    error: "Save failed",
  };

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div className="editor-branding">
          <Link href="/decks" onClick={confirmNavigate} aria-label="Back to decks">←</Link>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/lu-logomark.svg" alt="" width={32} height={32} />
          <div><strong>{deck.title}</strong><span>{deck.clientName}{deck.eventName ? ` · ${deck.eventName}` : ""}</span></div>
        </div>
        <nav className="editor-tabs" aria-label="Editor views">
          {(["design", "outline", "voiceover"] as Tab[]).map((item) => (
            <button type="button" aria-pressed={tab === item} onClick={() => setTab(item)} key={item}>{item[0].toUpperCase() + item.slice(1)}</button>
          ))}
        </nav>
        <div className="editor-actions">
          <span className={`save-state save-state-${saveState}`} aria-live="polite">{stateLabel[saveState]}</span>
          <Link className="button button-secondary" href="/decks" onClick={confirmNavigate}>Close</Link>
          <button className="button button-primary" type="button" onClick={() => void save()} disabled={!dirty || saveState === "saving" || saveState === "conflict"}>Save</button>
        </div>
      </header>

      {message && <div className={`editor-message editor-message-${saveState}`} role="alert">{message}{saveState === "conflict" && <button type="button" onClick={() => window.location.reload()}>Refresh slide</button>}</div>}

      <div className="editor-body">
        <aside className="slide-strip" aria-label="Slides">
          <div className="slide-strip-heading">
            <span>Slides</span>
            <div>
              <button type="button" onClick={duplicateCurrentSlide} disabled={isAdding} aria-label="Duplicate current slide">⧉</button>
              <button type="button" onClick={deleteCurrentSlide} disabled={isAdding || deck.slides.length === 1} aria-label="Delete current slide">−</button>
              <button type="button" onClick={addSlide} disabled={isAdding} aria-label="Add slide">{isAdding ? "…" : "+"}</button>
            </div>
          </div>
          <ol>
            {deck.slides.map((slide) => (
              <li key={slide.id}>
                <Link className={slide.id === initialSlide.id ? "is-current" : ""} href={`/decks/${deck.id}/edit/${slide.position}`} onClick={confirmNavigate}>
                  <span>{slide.position}</span><div data-theme={deck.themeDefault}>{slide.blocks.blocks[0] && <MiniNode node={slide.blocks.blocks[0]} />}</div>
                </Link>
              </li>
            ))}
          </ol>
        </aside>

        <aside className="block-palette" aria-label="Block palette">
          {tab === "voiceover" ? (
            <div className="palette-note"><strong>Voiceover tools</strong><p>Upload and caption controls arrive in the next milestone.</p></div>
          ) : (
            <>
              <section>
                <h2>Layouts</h2>
                <div className="layout-palette">
                  {LAYOUTS.map((layout) => (
                    <button type="button" className={layout.key === layoutKey ? "is-selected" : ""} onClick={() => changeLayout(layout.key)} key={layout.key}>
                      <span dangerouslySetInnerHTML={{ __html: layout.preview }} aria-hidden="true" />
                      <strong>{layout.name}</strong>
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <h2>Content</h2>
                <div className="content-palette">
                  {CONTENT_PALETTE.map((item) => <button type="button" onClick={() => addBlock(item.type)} key={item.type}>{item.label}</button>)}
                </div>
              </section>
            </>
          )}
        </aside>

        <section className="editor-workspace">
          <div className="editor-context"><span>Editing slide {initialSlide.position} of {deck.slides.length}</span><span>{layoutKey.replaceAll("-", " ")}</span></div>
          {tab === "design" && <div className="design-workspace"><SlideCanvas doc={doc} theme={deck.themeDefault} editor={{
            onDelete: removeBlock,
            onDuplicate: (node) => markDoc(duplicateNode(docRef.current, node.id)),
            onMove: (node, direction) => markDoc(moveNode(docRef.current, node.id, direction)),
            onDrop: (sourceId, targetId) => markDoc(reorderNode(docRef.current, sourceId, targetId)),
          }} /></div>}
          {tab === "outline" && <div className="outline-workspace"><OutlineNodes nodes={doc.blocks} onText={updateText} onUpdate={updateNode} /></div>}
          {tab === "voiceover" && <div className="voiceover-empty"><p className="eyebrow">Voiceover</p><h2>Add narration after the editing foundation is complete</h2><p>The player, audio upload, and caption cue editor are the following roadmap milestone.</p></div>}
        </section>
      </div>
    </main>
  );
}

function MiniNode({ node }: { node: Node }) {
  if (isLayout(node)) return <>{node.children.slice(0, 2).map((child) => <MiniNode node={child} key={child.id} />)}</>;
  if (isTextNode(node)) return <small>{plainText(node.props.text)}</small>;
  if (node.type === "statCard") return <small>{node.props.value}</small>;
  return <small>{node.type}</small>;
}

function OutlineNodes({ nodes, onText, onUpdate }: { nodes: Node[]; onText: (id: string, text: string) => void; onUpdate: (id: string, update: (node: ContentNode) => ContentNode) => void }) {
  return <div className="outline-nodes">{nodes.map((node) => <OutlineNode node={node} onText={onText} onUpdate={onUpdate} key={node.id} />)}</div>;
}

function OutlineNode({ node, onText, onUpdate }: { node: Node; onText: (id: string, text: string) => void; onUpdate: (id: string, update: (node: ContentNode) => ContentNode) => void }) {
  if (isLayout(node)) {
    return <fieldset className="outline-layout"><legend>{node.type}</legend><OutlineNodes nodes={node.children} onText={onText} onUpdate={onUpdate} /></fieldset>;
  }
  return (
    <section className="outline-block">
      <h3>{node.type}</h3>
      {isTextNode(node) && <RichTextEditor node={node} onText={onText} onUpdate={onUpdate} />}
      {node.type === "blockquote" && <Field label="Attribution" value={node.props.attribution ?? ""} onChange={(value) => onUpdate(node.id, (current) => current.type === "blockquote" ? { ...current, props: { ...current.props, attribution: value } } : current)} />}
      {node.type === "callout" && <label>Style<select value={node.props.variant} onChange={(event) => onUpdate(node.id, (current) => current.type === "callout" ? { ...current, props: { ...current.props, variant: event.target.value as "accent" | "teal" | "blue" } } : current)}><option value="accent">Accent</option><option value="teal">Teal</option><option value="blue">Blue</option></select></label>}
      {node.type === "image" && <>
        <Field label="Image URL" value={node.props.src} onChange={(value) => onUpdate(node.id, (current) => current.type === "image" ? { ...current, props: { ...current.props, src: value } } : current)} />
        <Field label="Alt text" value={node.props.alt} disabled={node.props.decorative} onChange={(value) => onUpdate(node.id, (current) => current.type === "image" ? { ...current, props: { ...current.props, alt: value } } : current)} />
        <Check label="Decorative image" checked={node.props.decorative ?? false} onChange={(checked) => onUpdate(node.id, (current) => current.type === "image" ? { ...current, props: { ...current.props, decorative: checked } } : current)} />
      </>}
      {node.type === "list" && <>
        <Check label="Numbered list" checked={node.props.ordered} onChange={(checked) => onUpdate(node.id, (current) => current.type === "list" ? { ...current, props: { ...current.props, ordered: checked } } : current)} />
        <label>Items <small>One item per line</small><textarea rows={5} value={node.props.items.map(plainText).join("\n")} onChange={(event) => onUpdate(node.id, (current) => current.type === "list" ? { ...current, props: { ...current.props, items: event.target.value.split("\n").map((text) => [{ text }]) } } : current)} /></label>
      </>}
      {node.type === "statCard" && <>
        <Field label="Value" value={node.props.value} onChange={(value) => onUpdate(node.id, (current) => current.type === "statCard" ? { ...current, props: { ...current.props, value } } : current)} />
        <Field label="Label" value={node.props.label} onChange={(value) => onUpdate(node.id, (current) => current.type === "statCard" ? { ...current, props: { ...current.props, label: value } } : current)} />
        <Field label="Caption" value={node.props.caption ?? ""} onChange={(value) => onUpdate(node.id, (current) => current.type === "statCard" ? { ...current, props: { ...current.props, caption: value } } : current)} />
      </>}
      {node.type === "table" && <>
        <Field label="Headers" hint="Separate columns with |" value={node.props.header.join(" | ")} onChange={(value) => onUpdate(node.id, (current) => current.type === "table" ? { ...current, props: { ...current.props, header: splitRow(value) } } : current)} />
        <label>Rows <small>One row per line; separate columns with |</small><textarea rows={5} value={node.props.rows.map((row) => row.join(" | ")).join("\n")} onChange={(event) => onUpdate(node.id, (current) => current.type === "table" ? { ...current, props: { ...current.props, rows: event.target.value.split("\n").map(splitRow) } } : current)} /></label>
      </>}
      {node.type === "pricingTable" && <label>Pricing columns <small>Name | Price | comma-separated features</small><textarea rows={6} value={node.props.columns.map((column) => `${column.name} | ${column.price} | ${column.features.join(", ")}`).join("\n")} onChange={(event) => onUpdate(node.id, (current) => current.type === "pricingTable" ? { ...current, props: { ...current.props, columns: event.target.value.split("\n").filter(Boolean).map((line) => { const [name = "", price = "", features = ""] = line.split("|").map((part) => part.trim()); return { name, price, features: features.split(",").map((feature) => feature.trim()).filter(Boolean) }; }) } } : current)} /></label>}
      {node.type === "chart" && <>
        <label>Chart type<select value={node.props.chartType} onChange={(event) => onUpdate(node.id, (current) => current.type === "chart" ? { ...current, props: { ...current.props, chartType: event.target.value as "bar" | "line" | "pie" } } : current)}><option value="bar">Bar</option><option value="line">Line</option><option value="pie">Pie</option></select></label>
        <Field label="Labels" hint="Comma separated" value={node.props.labels.join(", ")} onChange={(value) => onUpdate(node.id, (current) => current.type === "chart" ? { ...current, props: { ...current.props, labels: value.split(",").map((part) => part.trim()) } } : current)} />
        <Field label="Values" hint="Comma separated numbers" value={node.props.series.join(", ")} onChange={(value) => onUpdate(node.id, (current) => current.type === "chart" ? { ...current, props: { ...current.props, series: value.split(",").map((part) => Number(part.trim()) || 0) } } : current)} />
      </>}
    </section>
  );
}

function RichTextEditor({ node, onText, onUpdate }: { node: TextNode; onText: (id: string, text: string) => void; onUpdate: (id: string, update: (node: ContentNode) => ContentNode) => void }) {
  const marks = node.props.text[0] ?? { text: "" };
  const setMark = (mark: "bold" | "italic" | "underline", value: boolean) => onUpdate(node.id, (current) => {
    if (!isTextNode(current)) return current;
    return { ...current, props: { ...current.props, text: current.props.text.map((part) => ({ ...part, [mark]: value || undefined })) } } as ContentNode;
  });
  return <>
    <div className="rich-toolbar" aria-label={`Format ${node.type}`}>
      <button type="button" aria-pressed={marks.bold ?? false} onClick={() => setMark("bold", !marks.bold)}><strong>B</strong></button>
      <button type="button" aria-pressed={marks.italic ?? false} onClick={() => setMark("italic", !marks.italic)}><em>I</em></button>
      <button type="button" aria-pressed={marks.underline ?? false} onClick={() => setMark("underline", !marks.underline)}><u>U</u></button>
      <label>Size<select value={marks.size ?? "md"} onChange={(event) => onUpdate(node.id, (current) => {
        if (!isTextNode(current)) return current;
        const size = event.target.value as "sm" | "md" | "lg";
        return { ...current, props: { ...current.props, text: current.props.text.map((part) => ({ ...part, size })) } } as ContentNode;
      })}><option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option></select></label>
    </div>
    <textarea value={plainText(node.props.text)} onChange={(event) => onText(node.id, event.target.value)} rows={node.type === "title" ? 2 : 4} aria-label={`${node.type} text`} />
  </>;
}

function Field({ label, value, onChange, hint, disabled = false }: { label: string; value: string; onChange: (value: string) => void; hint?: string; disabled?: boolean }) {
  return <label>{label}{hint && <small>{hint}</small>}<input type="text" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="outline-check"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function splitRow(value: string): string[] {
  return value.split("|").map((part) => part.trim());
}
