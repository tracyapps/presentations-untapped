"use client";

import { useEffect, useRef, useState } from "react";
import type { VoiceoverData } from "@/lib/voiceover";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

export default function VoiceoverPlayer({ voiceover, active = true, onTimeUpdate }: {
  voiceover: VoiceoverData;
  active?: boolean;
  onTimeUpdate?: (seconds: number) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [playError, setPlayError] = useState("");
  const activeCue = captionsEnabled
    ? voiceover.cues.find((cue) => currentTime >= cue.start && currentTime < cue.end)
    : undefined;

  useEffect(() => {
    setExpanded(false);
    setPlaying(false);
    setCurrentTime(0);
    setPlayError("");
    onTimeUpdate?.(0);
  }, [voiceover.audioUrl, onTimeUpdate]);

  useEffect(() => {
    if (!active) audioRef.current?.pause();
  }, [active]);

  async function play() {
    setExpanded(true);
    setPlayError("");
    try {
      await audioRef.current?.play();
    } catch {
      setPlayError("The browser could not play this audio file.");
    }
  }

  function pause() {
    audioRef.current?.pause();
  }

  function seek(seconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Math.max(0, Math.min(voiceover.durationSec, seconds));
    audio.currentTime = next;
    setCurrentTime(next);
    onTimeUpdate?.(next);
  }

  return <section className={`voiceover-player${expanded ? " is-expanded" : ""}`} aria-label="Voiceover player">
    <audio
      ref={audioRef}
      src={voiceover.audioUrl}
      preload="metadata"
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)}
      onTimeUpdate={(event) => {
        const time = event.currentTarget.currentTime;
        setCurrentTime(time);
        onTimeUpdate?.(time);
      }}
    />
    {!expanded ? <button className="voiceover-play-big" type="button" onClick={() => void play()}>
      <span aria-hidden="true">▶</span>
      <strong>Play voiceover</strong>
      <small>{formatTime(voiceover.durationSec)}</small>
    </button> : <div className="voiceover-transport">
      <button type="button" onClick={() => seek(currentTime - 10)} aria-label="Back 10 seconds">↶ <span>10</span></button>
      <button className="voiceover-play-toggle" type="button" onClick={() => playing ? pause() : void play()} aria-label={playing ? "Pause voiceover" : "Play voiceover"}>{playing ? "❚❚" : "▶"}</button>
      <button type="button" onClick={() => seek(currentTime + 10)} aria-label="Forward 10 seconds"><span>10</span> ↷</button>
      <label className="voiceover-seek">
        <span className="sr-only">Voiceover position</span>
        <input type="range" min={0} max={voiceover.durationSec} step={0.05} value={Math.min(currentTime, voiceover.durationSec)} onChange={(event) => seek(Number(event.target.value))} />
        <small>{formatTime(currentTime)} / {formatTime(voiceover.durationSec)}</small>
      </label>
      <button className={captionsEnabled ? "is-active" : ""} type="button" aria-pressed={captionsEnabled} onClick={() => setCaptionsEnabled((current) => !current)}>CC</button>
    </div>}
    {playError && <p className="voiceover-player-error" role="alert">{playError}</p>}
    <div className="voiceover-caption" aria-live="polite" aria-atomic="true">{activeCue?.text ?? ""}</div>
  </section>;
}
