"use client";

/**
 * One level at a time.
 *
 * The sidebar's job is the confident path: you already know what you want, you
 * just need to reach it. A flat list does that for four saved blocks and stops
 * doing it at forty — which is the state this library is a week away from. So
 * the rail shows groups first, and stepping into one *replaces* the view rather
 * than expanding below it. Nothing ever grows past the height it already had,
 * which is the property that matters while you are mid-edit; an accordion is
 * exactly the thing that yanks the layout around underneath you.
 *
 * (The pattern goes by a few names — drill-down menu, master/detail rail. It is
 * the same one the WordPress customizer uses down its left column.)
 *
 * Browsing — "show me everything tagged onboarding, sorted by most used" — is
 * not this. That is the picker modal, and the Browse all button hands off to it
 * rather than growing a second, worse copy of it here.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

export type DrilldownGroup<T> = {
  id: string;
  label: string;
  /** Shown under the label at the group level — say why the group exists when
   *  the name alone does not ("No category yet"). */
  hint?: string;
  items: T[];
};

export default function DrilldownNav<T extends { id: string }>({
  groups, renderItem, emptyLabel, level, onLevelChange, itemsLabel = "items",
}: {
  groups: Array<DrilldownGroup<T>>;
  renderItem: (item: T) => ReactNode;
  /** Shown when a group turns out to be empty. */
  emptyLabel?: string;
  /** Controlled so the caller can jump straight to a group, and so the level
   *  survives the section being collapsed and reopened. */
  level: string | null;
  onLevelChange: (groupId: string | null) => void;
  itemsLabel?: string;
}) {
  const active = groups.find((group) => group.id === level) ?? null;
  const backRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // First render should not animate, or the rail slides in every time the
  // section is reopened.
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);

  // Moving focus to the new level is the whole reason this is usable by
  // keyboard: without it, tabbing continues from a control that is no longer
  // on screen.
  const previousLevel = useRef(level);
  useEffect(() => {
    if (previousLevel.current === level) return;
    previousLevel.current = level;
    if (!ready) return;
    if (level) backRef.current?.focus();
    else listRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [level, ready]);

  return (
    <div className="drilldown" data-level={active ? "items" : "groups"} data-ready={ready || undefined}>
      {/* A region that exists from the start, so changing levels actually gets
          announced. A live region mounted at the same moment its content
          appears announces nothing in most screen readers. */}
      <p className="sr-only" role="status" aria-live="polite">
        {active
          ? `${active.label}, ${active.items.length} ${active.items.length === 1 ? itemsLabel.replace(/s$/, "") : itemsLabel}.`
          : `${groups.length} ${groups.length === 1 ? "group" : "groups"}.`}
      </p>
      <div className="drilldown-track">
        {/* `inert` rather than display:none, so the outgoing level can slide out
            while still being unreachable by tab or screen reader. */}
        <div className="drilldown-panel" ref={listRef} inert={Boolean(active)}>
          <ul className="drilldown-groups">
            {groups.map((group) => (
              <li key={group.id}>
                <button type="button" onClick={() => onLevelChange(group.id)} disabled={!group.items.length}>
                  <span className="drilldown-group-label">
                    <strong>{group.label}</strong>
                    {group.hint && <small>{group.hint}</small>}
                  </span>
                  <span className="drilldown-count">
                    {group.items.length}
                    <span className="sr-only"> {group.items.length === 1 ? itemsLabel.replace(/s$/, "") : itemsLabel}</span>
                  </span>
                  <i aria-hidden="true">›</i>
                </button>
              </li>
            ))}
            {!groups.length && <li className="drilldown-empty">{emptyLabel ?? "Nothing here yet."}</li>}
          </ul>
        </div>

        <div className="drilldown-panel" inert={!active}>
          {active && (
            <>
              <button ref={backRef} type="button" className="drilldown-back" onClick={() => onLevelChange(null)}>
                <i aria-hidden="true">‹</i>
                <span>Back to all groups</span>
              </button>
              <p className="drilldown-heading">
                {active.label} <span>{active.items.length}</span>
              </p>
              <ul className="drilldown-items">
                {active.items.map((item) => <li key={item.id}>{renderItem(item)}</li>)}
                {!active.items.length && <li className="drilldown-empty">{emptyLabel ?? "Nothing in here."}</li>}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
