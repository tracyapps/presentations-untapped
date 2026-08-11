"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ImageFramePicker from "@/components/ImageFramePicker";
import MediaLibraryPanel from "@/components/MediaLibraryPanel";
import type { MediaAsset } from "@/lib/data/media";
import { frameByKey } from "@/lib/slides/styles";
import type { ContentNode, ContentProps } from "@/lib/slides/types";

type ImageNode = Extract<ContentNode, { type: "image" }>;

type MediaLibraryModalProps = {
  image: ImageNode | null;
  items: MediaAsset[];
  configured: boolean;
  loadError?: string;
  onClose: () => void;
  onUploaded: (asset: MediaAsset) => void;
  onDelete: (asset: MediaAsset) => Promise<boolean>;
  onApply: (id: string, props: ContentProps["image"]) => void;
};

function defaultAlt(asset: MediaAsset): string {
  return asset.name.replace(/\.[^.]+$/, "").replaceAll("-", " ");
}

export default function MediaLibraryModal({ image, items, configured, loadError, onClose, onUploaded, onDelete, onApply }: MediaLibraryModalProps) {
  const [draft, setDraft] = useState<ContentProps["image"]>({ src: "", alt: "" });
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!image) return;
    setDraft({ ...image.props });
  }, [image]);

  useEffect(() => {
    if (!image) return;
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
  }, [image, onClose]);

  const selectedAsset = useMemo(() => items.find((item) => item.url === draft.src), [draft.src, items]);
  if (!image) return null;

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
          <div><p className="eyebrow">Image block</p><h2 id="media-modal-title">Choose media</h2></div>
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
            <label>Image URL<input type="url" value={draft.src} onChange={(event) => setDraft((current) => ({ ...current, src: event.target.value }))} placeholder="https://…" /></label>
            <label>Alt text<input type="text" value={draft.alt} disabled={draft.decorative} onChange={(event) => setDraft((current) => ({ ...current, alt: event.target.value }))} /></label>
            <label className="outline-check"><input type="checkbox" checked={draft.decorative ?? false} onChange={(event) => setDraft((current) => ({ ...current, decorative: event.target.checked }))} />Decorative image</label>
            <label>Caption<textarea rows={3} value={draft.caption ?? ""} onChange={(event) => setDraft((current) => ({ ...current, caption: event.target.value }))} placeholder="Optional caption shown below the image" /></label>
            <ImageFramePicker value={draft.frame} onChange={(frameKey) => setDraft((current) => ({ ...current, frame: frameKey }))} />
          </aside>
        </div>
        <footer className="media-modal-footer">
          <span>{draft.src ? "Ready to use this image." : "Choose an uploaded image or upload a new one."}</span>
          <div><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="button" onClick={() => { onApply(image.id, draft); onClose(); }}>Use image</button></div>
        </footer>
      </section>
    </div>
  );
}
