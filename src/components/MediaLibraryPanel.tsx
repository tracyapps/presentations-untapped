"use client";

import { useRef, useState } from "react";
import type { MediaAsset } from "@/lib/data/media";
import { MEDIA_DRAG_TYPE, readMediaDrag } from "@/lib/media-dnd";
import policy from "@/lib/media-policy.json";

const ALLOWED_IMAGE_TYPES = new Set(policy.allowedContentTypes);

function safeFilename(filename: string): string {
  const cleaned = filename.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "image";
}

function readableSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type MediaLibraryPanelProps = {
  items: MediaAsset[];
  configured: boolean;
  loadError?: string;
  selectedUrl?: string;
  variant?: "compact" | "modal";
  onUploaded: (asset: MediaAsset) => void;
  onSelect: (asset: MediaAsset) => void;
  onDelete?: (asset: MediaAsset) => Promise<boolean>;
};

export default function MediaLibraryPanel({ items, configured, loadError, selectedUrl, variant = "compact", onUploaded, onSelect, onDelete }: MediaLibraryPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [deletingUrl, setDeletingUrl] = useState("");

  async function uploadFile(file: File) {
    setMessage("");
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setMessage("Choose a JPG, PNG, WebP, or GIF image.");
      return;
    }
    if (file.size > policy.maximumSizeInBytes) {
      setMessage("Images must be 15 MB or smaller.");
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const { upload } = await import("@vercel/blob/client");
      const blob = await upload(`${policy.prefix}${crypto.randomUUID()}--${safeFilename(file.name)}`, file, {
        access: "public",
        handleUploadUrl: "/api/media/upload",
        contentType: file.type,
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
      });
      const asset: MediaAsset = {
        url: blob.url,
        pathname: blob.pathname,
        name: file.name,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        contentType: blob.contentType,
      };
      onUploaded(asset);
      onSelect(asset);
      setMessage(`Uploaded ${file.name}.`);
    } catch (error) {
      console.error("Media upload failed", error);
      setMessage("The image could not be uploaded. Check the Blob connection and try again.");
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function chooseFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) void uploadFile(file);
  }

  async function deleteAsset(asset: MediaAsset) {
    if (!onDelete || deletingUrl) return;
    setDeletingUrl(asset.url);
    setMessage("");
    try {
      const deleted = await onDelete(asset);
      if (deleted) setMessage(`Deleted ${asset.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The image could not be deleted.");
    } finally {
      setDeletingUrl("");
    }
  }

  return <div className={`media-library-panel media-library-panel-${variant}`}>
    <input ref={inputRef} className="sr-only" type="file" accept={policy.allowedContentTypes.join(",")} disabled={!configured || uploading} onChange={(event) => chooseFiles(event.target.files)} />
    <button
      className={`media-dropzone${dragging ? " is-dragging" : ""}`}
      type="button"
      disabled={!configured || uploading}
      onClick={() => inputRef.current?.click()}
      onDragEnter={(event) => { event.preventDefault(); if (configured && !uploading) setDragging(true); }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
      onDragLeave={(event) => {
        const related = event.relatedTarget;
        if (!(related instanceof Node) || !event.currentTarget.contains(related)) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!configured || uploading) return;
        const existing = readMediaDrag(event.dataTransfer);
        if (existing) {
          onSelect(existing);
          setMessage(`Selected ${existing.name} from the media library.`);
          return;
        }
        chooseFiles(event.dataTransfer.files);
      }}
    >
      <strong>{uploading ? `Uploading… ${progress}%` : "Drop an image here"}</strong>
      <span>{configured ? "or click to browse your drive · JPG, PNG, WebP, GIF · 15 MB max" : "Connect Vercel Blob to enable uploads"}</span>
      {uploading && <i aria-hidden="true"><b style={{ width: `${progress}%` }} /></i>}
    </button>
    {(message || loadError) && <p className={message.startsWith("Uploaded") ? "media-message is-success" : "media-message"} role="status">{message || loadError}</p>}
    <div className="media-grid" aria-label="Media library">
      {items.map((item) => <article
        className={selectedUrl === item.url ? "is-selected" : ""}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData(MEDIA_DRAG_TYPE, JSON.stringify(item));
          event.dataTransfer.setData("text/uri-list", item.url);
          const image = event.currentTarget.querySelector("img");
          if (image) event.dataTransfer.setDragImage(image, image.clientWidth / 2, image.clientHeight / 2);
        }}
        key={item.url}
      >
        <button type="button" className="media-item-select" aria-pressed={selectedUrl === item.url} title={`${item.name} · ${readableSize(item.size)}`} onClick={() => onSelect(item)}>
          {/* Blob URLs are dynamic and intentionally rendered without Next image optimization in the editor. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.url} alt="" draggable={false} />
          <span>{item.name}</span>
        </button>
        {onDelete && <button type="button" className="media-item-delete" aria-label={`Delete ${item.name} from media library`} disabled={!!deletingUrl} onClick={() => void deleteAsset(item)}>{deletingUrl === item.url ? "…" : "×"}</button>}
      </article>)}
      {configured && !items.length && !loadError && <p>No media uploaded yet.</p>}
    </div>
  </div>;
}
