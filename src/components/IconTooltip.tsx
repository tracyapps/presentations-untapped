"use client";

import {
  cloneElement,
  type ReactElement,
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type TooltipPosition = {
  arrowLeft: number;
  left: number;
  side: "above" | "below";
  top: number;
};

export default function IconTooltip({
  children,
  description,
  label,
  shortcut,
}: {
  children: ReactElement<{ "aria-describedby"?: string }>;
  description?: ReactNode;
  label: ReactNode;
  shortcut?: string;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) return;

    function placeTooltip() {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const tooltip = tooltipRef.current?.getBoundingClientRect();
      if (!trigger || !tooltip) return;

      const edgeGap = 10;
      const desiredLeft = trigger.left + trigger.width / 2 - tooltip.width / 2;
      const left = Math.min(
        Math.max(edgeGap, desiredLeft),
        Math.max(edgeGap, window.innerWidth - tooltip.width - edgeGap),
      );
      const fitsBelow = trigger.bottom + 8 + tooltip.height <= window.innerHeight - edgeGap;
      const side = fitsBelow ? "below" : "above";
      const top = side === "below" ? trigger.bottom + 8 : trigger.top - tooltip.height - 8;
      const arrowLeft = Math.min(
        Math.max(12, trigger.left + trigger.width / 2 - left),
        tooltip.width - 12,
      );
      setPosition({ arrowLeft, left, side, top: Math.max(edgeGap, top) });
    }

    placeTooltip();
    const scrollOptions = { capture: true, passive: true } as const;
    window.addEventListener("resize", placeTooltip);
    window.addEventListener("scroll", placeTooltip, scrollOptions);
    return () => {
      window.removeEventListener("resize", placeTooltip);
      window.removeEventListener("scroll", placeTooltip, scrollOptions);
    };
  }, [open]);

  const describedBy = [children.props["aria-describedby"], open ? id : null].filter(Boolean).join(" ") || undefined;

  return (
    <span
      className="icon-tooltip-trigger"
      ref={triggerRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
      onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
    >
      {cloneElement(children, { "aria-describedby": describedBy })}
      {open && createPortal(
        <span
          className={`icon-tooltip icon-tooltip-${position?.side ?? "below"}`}
          id={id}
          ref={tooltipRef}
          role="tooltip"
          style={{
            left: position?.left ?? -10_000,
            top: position?.top ?? -10_000,
            visibility: position ? "visible" : "hidden",
            "--tooltip-arrow-left": `${position?.arrowLeft ?? 16}px`,
          } as React.CSSProperties}
        >
          <span className="icon-tooltip-label">{label}</span>
          {(description || shortcut) && (
            <span className="icon-tooltip-meta">
              {description && <span>{description}</span>}
              {shortcut && <kbd>{shortcut}</kbd>}
            </span>
          )}
        </span>
      , document.body)}
    </span>
  );
}
