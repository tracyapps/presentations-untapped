"use client";

/**
 * Per-block layout and design settings.
 *
 * Only images move freely on a slide; everything else stays in the flow. That is
 * a deliberate constraint — free-placed text is how a deck stops looking like it
 * came from one company — but a constraint needs an outlet, and this is it. The
 * knobs people actually reach for (space above/below, alignment, width, and a
 * safe background) without handing anyone a blank canvas.
 *
 * Every value is a named step, never a pixel. Spacing stays on the scale and a
 * block cannot be nudged one pixel out of line with its neighbours.
 */
import { useEffect, useRef, useState } from "react";
import { SURFACE_CHOICES } from "@/lib/slides/styles";
import type { SurfaceChoice } from "@/lib/slides/styles";
import type { BlockAlign, BlockLayout, Node, SpacingStep } from "@/lib/slides/types";

const SPACING: Array<{ value: SpacingStep; label: string }> = [
  { value: "none", label: "None" },
  { value: "sm", label: "S" },
  { value: "md", label: "M" },
  { value: "lg", label: "L" },
  { value: "xl", label: "XL" },
];

const ALIGN: Array<{ value: BlockAlign; label: string; glyph: string }> = [
  { value: "start", label: "Left", glyph: "⇤" },
  { value: "center", label: "Center", glyph: "↔" },
  { value: "end", label: "Right", glyph: "⇥" },
  { value: "stretch", label: "Full width", glyph: "⇹" },
];

const WIDTHS: Array<{ value: BlockLayout["width"]; label: string }> = [
  { value: undefined, label: "Auto" },
  { value: 3, label: "30%" },
  { value: 4, label: "40%" },
  { value: 5, label: "50%" },
  { value: 6, label: "60%" },
  { value: 8, label: "80%" },
  { value: 10, label: "100%" },
];

export default function BlockSettings({
  node, onChange, onChangeSurface,
}: {
  node: Node;
  onChange: (layout: BlockLayout) => void;
  onChangeSurface: (surface: SurfaceChoice | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const layout = node.layout ?? {};

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as globalThis.Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const patch = (update: Partial<BlockLayout>) => onChange({ ...layout, ...update });
  const configured = Object.values(layout).some((value) => value !== undefined)
    || Boolean(node.style?.surface && node.style.surface !== "inherit");

  return (
    <div className="block-settings" ref={containerRef}>
      <button
        ref={triggerRef} type="button"
        className={configured ? "is-configured" : undefined}
        aria-expanded={open}
        aria-label={`Layout and background settings for this ${node.type} block`}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">⚙</span>
      </button>

      {open && (
        <div className="block-settings-panel">
          <fieldset>
            <legend>Space above</legend>
            <StepGroup
              name={`${node.id}-before`} options={SPACING}
              value={layout.spaceBefore ?? "none"}
              onChange={(spaceBefore) => patch({ spaceBefore })}
            />
          </fieldset>

          <fieldset>
            <legend>Space below</legend>
            <StepGroup
              name={`${node.id}-after`} options={SPACING}
              value={layout.spaceAfter ?? "none"}
              onChange={(spaceAfter) => patch({ spaceAfter })}
            />
          </fieldset>

          <fieldset>
            <legend>Align on the slide</legend>
            <div className="block-settings-row">
              {ALIGN.map((option) => (
                <label key={option.value} className="block-settings-choice">
                  <input
                    type="radio" name={`${node.id}-align`}
                    checked={(layout.align ?? "stretch") === option.value}
                    onChange={() => patch({ align: option.value })}
                  />
                  <span aria-hidden="true">{option.glyph}</span>
                  <span className="sr-only">{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Width</legend>
            <label className="sr-only" htmlFor={`${node.id}-width`}>Block width</label>
            <select
              id={`${node.id}-width`}
              value={layout.width ?? ""}
              onChange={(event) => patch({
                width: event.target.value ? Number(event.target.value) as BlockLayout["width"] : undefined,
              })}
            >
              {WIDTHS.map((option) => (
                <option key={option.label} value={option.value ?? ""}>{option.label}</option>
              ))}
            </select>
          </fieldset>

          <fieldset>
            <legend>Background</legend>
            {/* Named, contrast-tested surfaces only. A raw colour picker here is
                how a deck ends up with unreadable text in dark mode. */}
            <label className="sr-only" htmlFor={`${node.id}-surface`}>Block background</label>
            <select
              id={`${node.id}-surface`}
              value={node.style?.surface ?? "inherit"}
              onChange={(event) => onChangeSurface(
                event.target.value === "inherit" ? undefined : event.target.value as SurfaceChoice,
              )}
            >
              {SURFACE_CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>{choice.label}</option>
              ))}
            </select>
          </fieldset>

          {configured && (
            <button
              type="button" className="block-settings-reset"
              onClick={() => { onChange({}); onChangeSurface(undefined); }}
            >
              Reset to slide defaults
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StepGroup<T extends string>({
  name, options, value, onChange,
}: {
  name: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="block-settings-row">
      {options.map((option) => (
        <label key={option.value} className="block-settings-choice">
          <input
            type="radio" name={name}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}
