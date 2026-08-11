"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import SlideCanvas from "@/components/SlideCanvas";
import VoiceoverPlayer from "@/components/VoiceoverPlayer";
import type { EditorDeck } from "@/lib/data/editor";

type Theme = "light" | "dark";

export default function PresentDeck({ deck }: { deck: EditorDeck }) {
  const shellRef = useRef<HTMLElement>(null);
  const overviewCloseRef = useRef<HTMLButtonElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [overview, setOverview] = useState(false);
  const [theme, setTheme] = useState<Theme>(deck.themeDefault);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const slide = deck.slides[currentIndex];
  const themeKey = `lu-present-theme-${deck.id}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(themeKey);
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {}
  }, [themeKey]);

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    if (overview) overviewCloseRef.current?.focus();
  }, [overview]);

  const previous = useCallback(() => setCurrentIndex((current) => Math.max(0, current - 1)), []);
  const next = useCallback(() => setCurrentIndex((current) => Math.min(deck.slides.length - 1, current + 1)), [deck.slides.length]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const isControl = !!target?.closest("button, a, input, select, textarea, audio");
      if ((event.key === "g" || event.key === "G") && !isControl) {
        event.preventDefault();
        setOverview((current) => !current);
        return;
      }
      if (event.key === "Escape") {
        if (overview) setOverview(false);
        else setOverview(true);
        return;
      }
      if (overview || isControl) return;
      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        next();
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        previous();
      } else if (event.key === "Home") {
        event.preventDefault();
        setCurrentIndex(0);
      } else if (event.key === "End") {
        event.preventDefault();
        setCurrentIndex(deck.slides.length - 1);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [deck.slides.length, next, overview, previous]);

  function chooseTheme(nextTheme: Theme) {
    setTheme(nextTheme);
    try { localStorage.setItem(themeKey, nextTheme); } catch {}
  }

  async function toggleFullscreen() {
    setFullscreenError("");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shellRef.current?.requestFullscreen();
    } catch {
      setFullscreenError("Full screen is unavailable in this browser window.");
    }
  }

  return <main className="present-shell" data-theme={theme} ref={shellRef}>
    <div className="present-stage">
      <div className="present-slide-stack">
        <div
          className="present-slide-click-target"
          role="region"
          aria-label={`Slide ${slide.position}: ${deck.title}`}
          tabIndex={0}
          onClick={next}
        >
          <SlideCanvas doc={slide.blocks} theme={theme} />
        </div>
        {slide.voiceover && <div className="present-voiceover" onClick={(event) => event.stopPropagation()}>
          <VoiceoverPlayer voiceover={slide.voiceover} />
        </div>}
      </div>
    </div>

    <header className="present-deck-title">
      <strong>{deck.title}</strong>
      <span>{deck.clientName}{deck.eventName ? ` · ${deck.eventName}` : ""}</span>
    </header>

    <nav className="present-controls" aria-label="Presentation controls" onClick={(event) => event.stopPropagation()}>
      <Link href={`/decks/${deck.id}/edit/${slide.position}`} aria-label="Exit presentation">×</Link>
      <button type="button" onClick={previous} disabled={currentIndex === 0} aria-label="Previous slide">←</button>
      <button type="button" onClick={() => setOverview(true)} aria-label="Open slide overview">{currentIndex + 1} / {deck.slides.length}</button>
      <button type="button" onClick={next} disabled={currentIndex === deck.slides.length - 1} aria-label="Next slide">→</button>
      <button type="button" aria-pressed={theme === "dark"} onClick={() => chooseTheme(theme === "dark" ? "light" : "dark")} aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}>{theme === "dark" ? "☀" : "◐"}</button>
      <button type="button" aria-pressed={fullscreen} onClick={() => void toggleFullscreen()} aria-label={fullscreen ? "Exit full screen" : "Enter full screen"}>{fullscreen ? "⊙" : "⛶"}</button>
    </nav>
    <p className="present-shortcuts">← → or Space to navigate · G for overview · Esc to toggle overview</p>
    {fullscreenError && <p className="present-error" role="alert">{fullscreenError}</p>}
    <span className="sr-only" aria-live="polite">Slide {currentIndex + 1} of {deck.slides.length}</span>

    {overview && <section className="present-overview" role="dialog" aria-modal="true" aria-labelledby="present-overview-title">
      <header><div><p className="eyebrow">Overview</p><h1 id="present-overview-title">{deck.title}</h1></div><button ref={overviewCloseRef} type="button" onClick={() => setOverview(false)} aria-label="Close slide overview">×</button></header>
      <div className="present-overview-grid">
        {deck.slides.map((item, index) => <button
          type="button"
          className={index === currentIndex ? "is-current" : ""}
          aria-current={index === currentIndex ? "true" : undefined}
          onClick={() => { setCurrentIndex(index); setOverview(false); }}
          key={item.id}
        >
          <span>{item.position}</span>
          <div className="present-overview-slide"><SlideCanvas doc={item.blocks} theme={theme} /></div>
        </button>)}
      </div>
    </section>}
  </main>;
}
