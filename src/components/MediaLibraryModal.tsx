"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ImageFramePicker from "@/components/ImageFramePicker";
import MediaLibraryPanel from "@/components/MediaLibraryPanel";
import type { MediaAsset } from "@/lib/data/media";
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
  onApply: (id: string, props: ContentProps["image"]) => void;
  onAddFloating: (asset: MediaAsset) => void;
  onUseAsBackground: (asset: MediaAsset) => void;
};

function defaultAlt(asset: MediaAsset): string {
  return asset.name.replace(/\.[^.]+$/, "").replaceAll("-", " ");
}

export default function MediaLibraryModal({ open, image, initialAsset, items, configured, loadError, onClose, onUploaded, onDelete, onApply, onAddFloating, onUseAsBackground }: MediaLibraryModalProps) {
  const [draft, setDraft] = useState<ContentProps["image"]>({ src: "", alt: "" });
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    if (image) setDraft({ ...image.props });
    else if (initialAsset) setDraft({ src: initialAsset.url, alt: defaultAlt(initialAsset), placement: "floating", x: 60, y: 18, width: 30 });
    else setDraft({ src: "", alt: "", placement: "floating", x: 60, y: 18, width: 30 });
  }, [image, initialAsset, open]);

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
  if (!open) return null;

  const frame = frameByKey(draft.frame);
  const frameStyle = frame ? { WebkitMaskImage: `url("${frame.asset}")`, maskImage: `url("${frame.asset}")` } : undefined;

  function selectAsset(asset: MediaAsset) {
    setDraft((current) => ({ ...current, src: asset.url, alt: current.alt || defaultAlt(asset) }));
  }

  async function deleteAsset(asset: MediaAsset) {
    const deleted = await onDelete(asset);
    if (deleted) setDraft((current) => current.src === asset.url ? { ...current, src: "" } : current);
    return deleted;
  }

  return (
    <div className="media-modal-backdrop">
      <section className="media-modal" role="dialog" aria-modal="true" aria-labelledby="media-modal-title">
        <header className="media-modal-header">
          <div><p className="eyebrow">{image ? "Image block" : "Media library"}</p><h2 id="media-modal-title">{image ? "Choose media" : "Preview and use media"}</h2></div>
          <button ref={closeRef} type="button" className="media-modal-close" aria-label="Close media library" onClick={onClose}>×</button>
        </header>
        <div className="media-modal-body">
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
            <div className="media-modal-preview">
              {draft.src ? <>
                {/* Blob and manually hosted image URLs are both supported. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={frame ? "has-frame" : ""} style={frameStyle} src={draft.src} alt="" />
                {draft.caption && <p>{draft.caption}</p>}
              </> : <span>No image selected</span>}
            </div>
            {selectedAsset && <div className="media-modal-file-meta"><strong>{selectedAsset.name}</strong><span>{Math.max(1, Math.round(selectedAsset.size / 1024))} KB</span></div>}
            {image && <>
              <label>Image URL<input type="url" value={draft.src} onChange={(event) => setDraft((current) => ({ ...current, src: event.target.value }))} placeholder="https://…" /></label>
              <label>Alt text<input type="text" value={draft.alt} disabled={draft.decorative} onChange={(event) => setDraft((current) => ({ ...current, alt: event.target.value }))} /></label>
              <label className="outline-check"><input type="checkbox" checked={draft.decorative ?? false} onChange={(event) => setDraft((current) => ({ ...current, decorative: event.target.checked }))} />Decorative image</label>
              <label>Caption<textarea rows={3} value={draft.caption ?? ""} onChange={(event) => setDraft((current) => ({ ...current, caption: event.target.value }))} placeholder="Optional caption shown below the image" /></label>
              <label className="outline-check"><input type="checkbox" checked={draft.placement === "floating"} onChange={(event) => setDraft((current) => ({ ...current, placement: event.target.checked ? "floating" : "flow", x: current.x ?? 60, y: current.y ?? 18, width: current.width ?? 30 }))} />Float image on slide</label>
            </>}
            {image && draft.placement === "floating" && <div className="floating-image-controls">
              <label>Horizontal <input type="range" min={0} max={88} step={1} value={draft.x ?? 60} onChange={(event) => setDraft((current) => ({ ...current, x: Number(event.target.value) }))} /></label>
              <label>Vertical <input type="range" min={0} max={82} step={1} value={draft.y ?? 18} onChange={(event) => setDraft((current) => ({ ...current, y: Number(event.target.value) }))} /></label>
              <label>Width <input type="range" min={12} max={100} step={1} value={draft.width ?? 30} onChange={(event) => setDraft((current) => ({ ...current, width: Number(event.target.value) }))} /></label>
            </div>}
            {image && <ImageFramePicker value={draft.frame} onChange={(frameKey) => setDraft((current) => ({ ...current, frame: frameKey }))} />}
          </aside>
        </div>
        <footer className="media-modal-footer">
          <span>{draft.src ? "Choose how to use this image." : "Choose an uploaded image or upload a new one."}</span>
          <div>
            <button className="button button-secondary" type="button" onClick={onClose}>Cancel</button>
            {!image && <button className="button button-secondary" type="button" disabled={!selectedAsset} onClick={() => { if (selectedAsset) { onUseAsBackground(selectedAsset); onClose(); } }}>Use as background</button>}
            {!image && <button className="button button-primary" type="button" disabled={!selectedAsset} onClick={() => { if (selectedAsset) { onAddFloating(selectedAsset); onClose(); } }}>Add to slide</button>}
            {image && <button className="button button-primary" type="button" disabled={!draft.src} onClick={() => { onApply(image.id, draft); onClose(); }}>Use image</button>}
          </div>
        </footer>
      </section>
    </div>
  );
}
