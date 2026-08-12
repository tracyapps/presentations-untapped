"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteVoiceoverAction, saveCaptionCuesAction, saveVoiceoverAction } from "@/app/decks/[id]/edit/voiceover-actions";
import VoiceoverPlayer from "@/components/VoiceoverPlayer";
import audioPolicy from "@/lib/audio-policy.json";
import { findPauseBoundaries, splitScriptIntoCaptions, timeCaptionScript } from "@/lib/caption-timing";
import type { CaptionCue } from "@/lib/slides/types";
import { validateCaptionCues, type VoiceoverData } from "@/lib/voiceover";

const ALLOWED_AUDIO_TYPES = new Set(audioPolicy.allowedContentTypes);

function safeFilename(filename: string): string {
  const cleaned = filename.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "voiceover";
}

function inferredMime(file: File): string {
  if (ALLOWED_AUDIO_TYPES.has(file.type)) return file.type;
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "m4a" || extension === "mp4") return "audio/mp4";
  if (extension === "wav") return "audio/wav";
  return file.type;
}

function filenameFromUrl(value: string): string {
  try {
    const leaf = decodeURIComponent(new URL(value).pathname.split("/").at(-1) ?? "Voiceover");
    return leaf.replace(/^(?:[0-9a-f-]{36}--)+/i, "");
  } catch {
    return "Voiceover";
  }
}

function fileDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      cleanup();
      if (Number.isFinite(duration) && duration > 0) resolve(duration);
      else reject(new Error("Invalid audio duration"));
    };
    audio.onerror = () => { cleanup(); reject(new Error("Unreadable audio")); };
    audio.src = objectUrl;
  });
}

export default function VoiceoverEditor({ deckId, slideId, configured, initialVoiceover, active, onDirtyChange }: {
  deckId: string;
  slideId: string;
  configured: boolean;
  initialVoiceover: VoiceoverData | null;
  active: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const scriptInputRef = useRef<HTMLInputElement>(null);
  const [voiceover, setVoiceover] = useState(initialVoiceover);
  const [cues, setCues] = useState<CaptionCue[]>(initialVoiceover?.cues ?? []);
  const [playhead, setPlayhead] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [savingCues, setSavingCues] = useState(false);
  const [script, setScript] = useState("");
  const [timingScript, setTimingScript] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const cueErrors = voiceover ? validateCaptionCues(cues, voiceover.durationSec) : [];
  const cuesDirty = !!voiceover && JSON.stringify(cues) !== JSON.stringify(voiceover.cues);
  const updatePlayhead = useCallback((seconds: number) => setPlayhead(seconds), []);

  useEffect(() => {
    onDirtyChange(cuesDirty);
    return () => onDirtyChange(false);
  }, [cuesDirty, onDirtyChange]);

  async function cleanupUpload(pathname: string) {
    try {
      await fetch("/api/audio", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pathname }),
      });
    } catch (cleanupError) {
      console.error("Failed to clean up unsaved audio", cleanupError);
    }
  }

  async function uploadFile(file: File) {
    setMessage("");
    setError("");
    const mime = inferredMime(file);
    if (!ALLOWED_AUDIO_TYPES.has(mime)) {
      setError("Choose an MP3, M4A, or WAV file.");
      return;
    }
    if (file.size > audioPolicy.maximumSizeInBytes) {
      setError("Voiceovers must be 25 MB or smaller.");
      return;
    }
    if (voiceover && !window.confirm("Replace this voiceover? Existing caption cues will be removed.")) return;

    setUploading(true);
    setProgress(0);
    let uploadedPathname = "";
    try {
      const durationSec = await fileDuration(file);
      const { upload } = await import("@vercel/blob/client");
      const blob = await upload(`${audioPolicy.prefix}${crypto.randomUUID()}--${safeFilename(file.name)}`, file, {
        access: "public",
        handleUploadUrl: "/api/audio/upload",
        contentType: mime,
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
      });
      uploadedPathname = blob.pathname;
      const result = await saveVoiceoverAction({ deckId, slideId, audioUrl: blob.url, mime, durationSec });
      if (result.status !== "saved") {
        await cleanupUpload(blob.pathname);
        setError(result.message);
        return;
      }
      setVoiceover(result.voiceover);
      setCues([]);
      setPlayhead(0);
      setMessage(`${file.name} is attached to this slide.`);
    } catch (uploadError) {
      if (uploadedPathname) await cleanupUpload(uploadedPathname);
      console.error("Voiceover upload failed", uploadError);
      setError("The voiceover could not be uploaded. Check the file and Blob connection, then try again.");
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeVoiceover() {
    if (!voiceover || !window.confirm("Delete this voiceover and its captions? This cannot be undone.")) return;
    setError("");
    setMessage("");
    try {
      const result = await deleteVoiceoverAction({ deckId, slideId });
      if (result.status === "error") { setError(result.message); return; }
      setVoiceover(null);
      setCues([]);
      setPlayhead(0);
      setMessage(result.status === "complete" ? result.message : "Voiceover deleted.");
    } catch {
      setError("The voiceover could not be deleted. Try again.");
    }
  }

  function updateCue(index: number, update: Partial<CaptionCue>) {
    setCues((current) => current.map((cue, cueIndex) => cueIndex === index ? { ...cue, ...update } : cue));
  }

  function addCue() {
    if (!voiceover) return;
    const start = Math.min(Math.round(playhead * 10) / 10, Math.max(0, voiceover.durationSec - 0.1));
    const end = Math.min(voiceover.durationSec, start + 3);
    setCues((current) => [...current, { start, end, text: "" }].sort((a, b) => a.start - b.start));
  }

  async function autoTimeScript() {
    if (!voiceover) return;
    const chunks = splitScriptIntoCaptions(script);
    if (!chunks.length) {
      setError("Paste a script before creating timed captions.");
      return;
    }
    setTimingScript(true);
    setError("");
    setMessage("");
    let context: AudioContext | null = null;
    try {
      const response = await fetch(voiceover.audioUrl);
      if (!response.ok) throw new Error(`Audio fetch failed with ${response.status}`);
      context = new AudioContext();
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
      const pauses = findPauseBoundaries(channels, buffer.sampleRate);
      setCues(timeCaptionScript(script, voiceover.durationSec, pauses));
      setMessage(`Created ${chunks.length} caption cues using ${pauses.length} waveform pause${pauses.length === 1 ? "" : "s"}. Review and save when ready.`);
    } catch (analysisError) {
      console.error("Waveform caption timing failed", analysisError);
      setCues(timeCaptionScript(script, voiceover.durationSec));
      setMessage(`Created ${chunks.length} caption cues with proportional timing. The waveform could not be read, so review the timing before saving.`);
    } finally {
      if (context) await context.close();
      setTimingScript(false);
    }
  }

  async function saveCues() {
    if (!voiceover || cueErrors.length) return;
    setSavingCues(true);
    setError("");
    setMessage("");
    try {
      const result = await saveCaptionCuesAction({ deckId, slideId, cues });
      if (result.status !== "saved") { setError(result.message); return; }
      setVoiceover(result.voiceover);
      setCues(result.voiceover.cues);
      setMessage("Captions saved.");
    } catch {
      setError("Captions could not be saved. Try again.");
    } finally {
      setSavingCues(false);
    }
  }

  return <div className="voiceover-workspace">
    <section className="voiceover-clip-panel">
      <p className="eyebrow">Slide voiceover</p>
      <input ref={inputRef} className="sr-only" type="file" accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav" disabled={!configured || uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file); }} />
      <button className="voiceover-dropzone" type="button" disabled={!configured || uploading} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = configured && !uploading ? "copy" : "none"; }} onDrop={(event) => { event.preventDefault(); if (!configured || uploading) return; const file = event.dataTransfer.files[0]; if (file) void uploadFile(file); }}>
        <strong>{uploading ? `Uploading… ${progress}%` : voiceover ? "Replace audio" : "Upload audio"}</strong>
        <span>{configured ? "Drop or browse · MP3, M4A, WAV · 25 MB max" : "Connect Vercel Blob to enable audio uploads"}</span>
        {uploading && <i aria-hidden="true"><b style={{ width: `${progress}%` }} /></i>}
      </button>
      {voiceover && <div className="voiceover-file-card">
        <div><strong>{filenameFromUrl(voiceover.audioUrl)}</strong><span>{voiceover.mime} · {Math.round(voiceover.durationSec)} sec</span></div>
        <button type="button" onClick={() => void removeVoiceover()}>Delete</button>
      </div>}
      {message && <p className="voiceover-status is-success" role="status">{message}</p>}
      {error && <p className="voiceover-status" role="alert">{error}</p>}
    </section>

    <section className="voiceover-preview-panel">
      <p className="eyebrow">Player preview</p>
      {voiceover ? <>
        <VoiceoverPlayer voiceover={{ ...voiceover, cues }} active={active} onTimeUpdate={updatePlayhead} />
        <div className="caption-script-import">
          <div><h2>Full script</h2><p>Paste narration or import a text file. We split it into captions and align boundaries to pauses in the audio waveform.</p></div>
          <input ref={scriptInputRef} className="sr-only" type="file" accept=".txt,text/plain" onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void file.text().then(setScript).catch(() => setError("The script file could not be read."));
            event.currentTarget.value = "";
          }} />
          <textarea rows={6} value={script} onChange={(event) => setScript(event.target.value)} placeholder="Paste the complete voiceover script here…" />
          <div><span>{script.trim() ? `${splitScriptIntoCaptions(script).length} estimated caption cues` : "No script loaded"}</span><button className="button button-secondary" type="button" onClick={() => scriptInputRef.current?.click()}>Import .txt</button><button className="button button-primary" type="button" disabled={!script.trim() || timingScript} onClick={() => void autoTimeScript()}>{timingScript ? "Reading waveform…" : "Auto-time script"}</button></div>
        </div>
        <div className="caption-editor-heading">
          <div><h2>Caption cues</h2><p>Add cues at the current playhead, then adjust timing and text.</p></div>
          <button className="button button-secondary" type="button" onClick={addCue}>＋ Cue at {playhead.toFixed(1)}s</button>
        </div>
        <div className="caption-cue-list">
          {cues.map((cue, index) => <div className="caption-cue-row" key={index}>
            <span>{index + 1}</span>
            <label><small>Start</small><input type="number" min={0} max={voiceover.durationSec} step={0.1} value={cue.start} onChange={(event) => updateCue(index, { start: Number(event.target.value) })} /></label>
            <label><small>End</small><input type="number" min={0} max={voiceover.durationSec} step={0.1} value={cue.end} onChange={(event) => updateCue(index, { end: Number(event.target.value) })} /></label>
            <label className="caption-cue-text"><small>Caption</small><input type="text" maxLength={1000} value={cue.text} onChange={(event) => updateCue(index, { text: event.target.value })} /></label>
            <button type="button" aria-label={`Delete cue ${index + 1}`} onClick={() => setCues((current) => current.filter((_, cueIndex) => cueIndex !== index))}>×</button>
          </div>)}
          {!cues.length && <p className="caption-cues-empty">No captions yet. Auto-time a full script above, or play and add cues manually at the playhead.</p>}
        </div>
        {cueErrors.length > 0 && <ul className="caption-errors" role="alert">{cueErrors.map((cueError) => <li key={cueError}>{cueError}</li>)}</ul>}
        <div className="caption-editor-actions"><span>{cuesDirty ? "Unsaved caption changes" : "Captions up to date"}</span><button className="button button-primary" type="button" disabled={!cuesDirty || !!cueErrors.length || savingCues} onClick={() => void saveCues()}>{savingCues ? "Saving…" : "Save captions"}</button></div>
      </> : <div className="voiceover-empty"><h2>Add narration for this slide</h2><p>Upload a clip to preview the shared player and create manual caption cues.</p></div>}
    </section>
  </div>;
}
