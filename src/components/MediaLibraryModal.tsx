"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ImageFramePicker from "@/components/ImageFramePicker";
import MediaLibraryPanel from "@/components/MediaLibraryPanel";
import type { MediaAsset } from "@/lib/data/media";
import { alignFloatingImage, clampFloatingImage, imageAspectRatio, type ImageAlignment } from "@/lib/image-geometry";
import { frameByKey } from "@/lib/slides/styles";
import type { ContentNode, ContentProps } from "@/lib/slides/types";

type ImageNode = Extract<ContentNode, { type: "image" }>;

type MediaLibraryModalProps = {
  open: boolean;
  image: ImageNode | null;
  initialAsset?: MediaAsset | null;
  items: MediaAsset[];
  configured: boolean;
  loadError?: string;
  onClose: () => void;
  onUploaded: (asset: MediaAsset) => void;
  onDelete: (asset: MediaAsset) => Promise<boolean>;
  onRename: (asset: MediaAsset, name: string) => Promise<{ asset: MediaAsset; message: string }>;
  onReplaceEverywhere: (source: MediaAsset, target: MediaAsset) => Promise<{ message: string }>;
  onApply: (id: string, props: ContentProps["image"]) => void;
  onAddFloating: (asset: MediaAsset) => void;
  onUseAsBackground: (asset: MediaAsset) => void;
};

function defaultAlt(asset: MediaAsset): string {
  return asset.name.replace(/\.[^.]+$/, "").replaceAll("-", " ");
}

export default function MediaLibraryModal({ open, image, initialAsset, items, configured, loadError, onClose, onUploaded, onDelete, onRename, onReplaceEverywhere, onApply, onAddFloating, onUseAsBackground }: MediaLibraryModalProps) {
  const [draft, setDraft] = useState<ContentProps["image"]>({ src: "", alt: "" });
  const [renameValue, setRenameValue] = useState("");
  const [renameMessage, setRenameMessage] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  /**
   * Two states, because the controls below the preview were unusable: change the
   * focal point or rotation and the thing you are adjusting has scrolled out of
   * sight. In "edit" the image is held large and still while the controls sit
   * beside it, so every change is visible as it happens.
   *
   * Which one opens is about intent — picking an image is a browse task,
   * adjusting one you already chose is an edit task.
   */
  const [view, setView] = useState<"browse" | "edit">(image ? "edit" : "browse");
  const closeRef = useRef<HTMLButtonElement>(null);
  /** Latest props for the open image, read by the seeding effect without making
   *  that effect depend on the node's identity. */
  const imageProps = useRef<ContentProps["image"] | null>(image ? { ...image.props } : null);
  imageProps.current = image ? { ...image.props } : null;

  /**
   * Seeds the draft when the modal opens on a different image.
   *
   * Keyed on the node **id**, not the node object: the node is rebuilt on every
   * parent render, so depending on its identity re-ran this effect constantly
   * and reset the draft back to the saved props — which is why position, focal
   * point, and rotation appeared to work in the preview and then vanish. The
   * draft is deliberately not resynced while the modal stays open on one image;
   * it is the user's uncommitted work until they press Use image.
   */
  const imageId = image?.id ?? null;
  const initialAssetUrl = initialAsset?.url ?? null;
  useEffect(() => {
    if (!open) return;
    setView(imageId ? "edit" : "browse");
    if (imageProps.current) setDraft({ ...imageProps.current });
    else if (initialAssetUrl) setDraft({ src: initialAssetUrl, alt: defaultAlt(initialAsset!), placement: "floating", x: 60, y: 18, width: 30 });
    else setDraft({ src: "", alt: "", placement: "floating", x: 60, y: 18, width: 30 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageId, initialAssetUrl, open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [open, onClose]);

  const selectedAsset = useMemo(() => items.find((item) => item.url === draft.src), [draft.src, items]);
  const sourceAsset = useMemo(() => items.find((item) => item.url === image?.props.src), [image?.props.src, items]);
  const selectedExtension = selectedAsset?.name.match(/(\.[a-z0-9]{2,5})$/i)?.[1] ?? "";
  useEffect(() => {
    setRenameValue(selectedAsset?.name.replace(/\.[a-z0-9]{2,5}$/i, "") ?? "");
    setRenameMessage("");
  }, [selectedAsset?.url]);
  if (!open) return null;

  const frame = frameByKey(draft.frame);
  const frameStyle = frame ? { WebkitMaskImage: `url("${frame.asset}")`, maskImage: `url("${frame.asset}")` } : undefined;

  function selectAsset(asset: MediaAsset) {
    // Clicking a thumbnail is a choice, not a browse — go straight to adjusting.
    if (image) setView("edit");
    setDraft((current) => ({ ...current, src: asset.url, alt: current.alt || defaultAlt(asset) }));
    const probe = new Image();
    probe.onload = () => {
      if (!probe.naturalWidth || !probe.naturalHeight) return;
      setDraft((current) => current.src === asset.url
        ? { ...current, aspectRatio: imageAspectRatio(probe.naturalWidth / probe.naturalHeight) }
        : current);
    };
    probe.src = asset.url;
  }

  function updateFloating(update: Partial<ContentProps["image"]>) {
    setDraft((current) => clampFloatingImage({ ...current, ...update, placement: "floating" }));
  }

  function alignImage(alignment: ImageAlignment) {
    setDraft((current) => alignFloatingImage(current, alignment));
  }

  async function renameAsset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAsset || !renameValue.trim() || isRenaming) return;
    setIsRenaming(true);
    setRenameMessage("");
    try {
      const result = await onRename(selectedAsset, renameValue);
      setDraft((current) => ({ ...current, src: result.asset.url }));
      setRenameMessage(result.message);
    } catch (error) {
      setRenameMessage(error instanceof Error ? error.message : "The image could not be renamed.");
    } finally {
      setIsRenaming(false);
    }
  }

  async function deleteAsset(asset: MediaAsset) {
    const deleted = await onDelete(asset);
    if (deleted) setDraft((current) => current.src === asset.url ? { ...current, src: "" } : current);
    return deleted;
  }

  async function replaceEverywhere() {
    if (!sourceAsset || !selectedAsset || sourceAsset.url === selectedAsset.url || isReplacing) return;
    if (!window.confirm(`Replace every use of “${sourceAsset.name}” with “${selectedAsset.name}” across this presentation? The original file will stay in the media library.`)) return;
    setIsReplacing(true);
    setRenameMessage("");
    try {
      const result = await onReplaceEverywhere(sourceAsset, selectedAsset);
      setRenameMessage(result.message);
    } catch (error) {
      setRenameMessage(error instanceof Error ? error.message : "The image could not be replaced everywhere.");
    } finally {
      setIsReplacing(false);
    }
  }

  return (
    <div className="media-modal-backdrop">
      <section className="media-modal" role="dialog" aria-modal="true" aria-labelledby="media-modal-title">
        <header className="media-modal-header">
          <div>
            <p className="eyebrow">{image ? "Image block" : "Media library"}</p>
            <h2 id="media-modal-title">{view === "edit" ? "Adjust image" : "Choose media"}</h2>
          </div>
          {image && (
            <div className="media-view-switch" role="radiogroup" aria-label="Media view">
              {(["browse", "edit"] as const).map((mode) => (
                <button
                  key={mode} type="button" role="radio"
                  aria-checked={view === mode}
                  tabIndex={view === mode ? 0 : -1}
                  className={view === mode ? "is-active" : undefined}
                  aria-disabled={mode === "edit" && !draft.src}
                  data-disabled={mode === "edit" && !draft.src ? true : undefined}
                  onClick={() => { if (mode !== "edit" || draft.src) setView(mode); }}
                >
                  {mode === "browse" ? "Library" : "Adjust"}
                </button>
              ))}
            </div>
          )}
          <button ref={closeRef} type="button" className="media-modal-close" aria-label="Close media library" onClick={onClose}>×</button>
        </header>
        <div className="media-modal-body" data-view={view}>
          <div className="media-modal-library">
            <MediaLibraryPanel
              variant="modal"
              items={items}
              configured={configured}
              loadError={loadError}
              selectedUrl={draft.src}
              onUploaded={onUploaded}
              onSelect={selectAsset}
              onDelete={deleteAsset}
            />
          </div>
          <aside className="media-modal-details" aria-label="Image details">
            <div className="media-modal-preview" data-stage={view === "edit" ? true : undefined}>
              {draft.src ? <>
                {/* Blob and manually hosted image URLs are both supported. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={frame ? "has-frame" : ""} style={{ ...frameStyle, objectFit: draft.fit ?? "cover", objectPosition: `${draft.focalX ?? 50}% ${draft.focalY ?? 50}%`, transform: `rotate(${draft.rotation ?? 0}deg)` }} src={draft.src} alt="" />
                {draft.caption && <p>{draft.caption}</p>}
              </> : <span>No image selected</span>}
            </div>
            {/* Controls are a sibling of the preview, not below it inside one
                scroller — that is what lets the edit view hold the image still
                while this column scrolls. */}
            <div className="media-modal-controls">
            {selectedAsset && <>
              <div className="media-modal-file-meta"><strong>{selectedAsset.name}</strong><span>{Math.max(1, Math.round(selectedAsset.size / 1024))} KB</span></div>
              <form className="media-rename-form" onSubmit={renameAsset}>
                <label><span>Media name</span><span className="media-name-field"><input type="text" maxLength={90} required value={renameValue} onChange={(event) => setRenameValue(event.target.value)} /><i>{selectedExtension}</i></span></label>
                <button className="button button-secondary" type="submit" disabled={isRenaming || !renameValue.trim()}>{isRenaming ? "Renaming…" : "Rename"}</button>
              </form>
              {renameMessage && <p className={`media-rename-message${renameMessage.startsWith("Renamed") || renameMessage.startsWith("Replaced") ? " is-success" : ""}`} role="status">{renameMessage}</p>}
            </>}
            {image && <>
              <label>Image URL<input type="url" value={draft.src} onChange={(event) => setDraft((current) => ({ ...current, src: event.target.value }))} placeholder="https://…" /></label>
              <label>Alt text<input type="text" value={draft.alt} disabled={draft.decorative} onChange={(event) => setDraft((current) => ({ ...current, alt: event.target.value }))} /></label>
              <label className="outline-check"><input type="checkbox" checked={draft.decorative ?? false} onChange={(event) => setDraft((current) => ({ ...current, decorative: event.target.checked }))} />Decorative image</label>
              <label>Caption<textarea rows={3} value={draft.caption ?? ""} onChange={(event) => setDraft((current) => ({ ...current, caption: event.target.value }))} placeholder="Optional caption shown below the image" /></label>
              <div className="image-crop-controls">
                <label>Image fit<select value={draft.fit ?? "cover"} onChange={(event) => setDraft((current) => ({ ...current, fit: event.target.value as "cover" | "contain" }))}><option value="cover">Crop to fill</option><option value="contain">Show whole image</option></select></label>
                <label>Focal point X <input type="range" min={0} max={100} step={1} value={draft.focalX ?? 50} onChange={(event) => setDraft((current) => ({ ...current, focalX: Number(event.target.value) }))} /></label>
                <label>Focal point Y <input type="range" min={0} max={100} step={1} value={draft.focalY ?? 50} onChange={(event) => setDraft((current) => ({ ...current, focalY: Number(event.target.value) }))} /></label>
                <label>Rotation <span className="range-with-value"><input type="range" min={-180} max={180} step={1} value={draft.rotation ?? 0} onChange={(event) => setDraft((current) => ({ ...current, rotation: Number(event.target.value) }))} /><output>{Math.round(draft.rotation ?? 0)}°</output></span></label>
              </div>
              <label className="outline-check"><input type="checkbox" checked={draft.placement === "floating"} onChange={(event) => setDraft((current) => event.target.checked ? clampFloatingImage({ ...current, placement: "floating" }) : { ...current, placement: "flow" })} />Float image on slide</label>
            </>}
            {image && draft.placement === "floating" && <div className="floating-image-controls">
              <strong>Position and size</strong>
              <label>Horizontal <input type="range" min={0} max={100} step={1} value={draft.x ?? 60} onChange={(event) => updateFloating({ x: Number(event.target.value) })} /></label>
              <label>Vertical <input type="range" min={0} max={100} step={1} value={draft.y ?? 18} onChange={(event) => updateFloating({ y: Number(event.target.value) })} /></label>
              <label>Width <input type="range" min={12} max={100} step={1} value={draft.width ?? 30} onChange={(event) => updateFloating({ width: Number(event.target.value) })} /></label>
              <div className="image-align-grid" role="group" aria-label="Align image on slide">
                <button type="button" onClick={() => alignImage("left")}>Left</button><button type="button" onClick={() => alignImage("center-x")}>Center H</button><button type="button" onClick={() => alignImage("right")}>Right</button>
                <button type="button" onClick={() => alignImage("top")}>Top</button><button type="button" onClick={() => alignImage("center-y")}>Center V</button><button type="button" onClick={() => alignImage("bottom")}>Bottom</button>
              </div>
            </div>}
            {image && <ImageFramePicker value={draft.frame} onChange={(frameKey) => setDraft((current) => ({ ...current, frame: frameKey }))} />}
            </div>
          </aside>
        </div>
        <footer className="media-modal-footer">
          <span>{draft.src ? "Choose how to use this image." : "Choose an uploaded image or upload a new one."}</span>
          <div>
            <button className="button button-secondary" type="button" onClick={onClose}>Cancel</button>
            {image && sourceAsset && selectedAsset && sourceAsset.url !== selectedAsset.url && <button className="button button-secondary" type="button" disabled={isReplacing} onClick={replaceEverywhere}>{isReplacing ? "Replacing…" : "Replace everywhere"}</button>}
            {!image && <button className="button button-secondary" type="button" disabled={!selectedAsset} onClick={() => { if (selectedAsset) { onUseAsBackground(selectedAsset); onClose(); } }}>Use as background</button>}
            {!image && <button className="button button-primary" type="button" disabled={!selectedAsset} onClick={() => { if (selectedAsset) { onAddFloating(selectedAsset); onClose(); } }}>Add to slide</button>}
            {image && <button className="button button-primary" type="button" disabled={!draft.src} onClick={() => { onApply(image.id, draft); onClose(); }}>Use image</button>}
          </div>
        </footer>
      </section>
    </div>
  );
}
