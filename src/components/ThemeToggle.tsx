"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

/** Light/dark toggle. Theme is set on <html data-theme> (pre-hydration
 *  script in layout.tsx prevents a flash) and persisted to localStorage. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as Theme) ?? "light");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("lu-theme", next); } catch {}
    setTheme(next);
  }

  if (!theme) return null; // avoids hydration mismatch

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={theme === "dark"}
      style={{
        font: "var(--text-body-sm)",
        background: "var(--bg-surface)",
        color: "var(--text-primary)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-pill)",
        padding: "var(--space-2) var(--space-4)",
        cursor: "pointer",
      }}
    >
      {theme === "dark" ? "☀️ Light mode" : "🌙 Dark mode"}
    </button>
  );
}
