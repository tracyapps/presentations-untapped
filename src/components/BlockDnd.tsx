"use client";

import { useState } from "react";

export type BlockDropTarget = {
  index: number;
  parentId: string | null;
};

type Axis = "horizontal" | "vertical";

function targetKey(target: BlockDropTarget): string {
  return `${target.parentId ?? "root"}:${target.index}`;
}

export function useBlockDnd(
  onMove: (sourceId: string, target: BlockDropTarget) => void,
) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [activeTarget, setActiveTarget] = useState<BlockDropTarget | null>(null);

  function start(event: React.DragEvent<HTMLElement>, sourceId: string, ghost?: Element | null) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-presentations-block", sourceId);
    event.dataTransfer.setData("text/plain", sourceId);
    if (ghost) event.dataTransfer.setDragImage(ghost, 24, 12);
    setDraggingId(sourceId);
  }

  function finish() {
    setDraggingId(null);
    setActiveTarget(null);
  }

  function drop(event: React.DragEvent<HTMLElement>, target: BlockDropTarget) {
    event.preventDefault();
    event.stopPropagation();
    const sourceId = draggingId
      ?? event.dataTransfer.getData("application/x-presentations-block")
      ?? event.dataTransfer.getData("text/plain");
    if (sourceId) onMove(sourceId, target);
    finish();
  }

  return { activeTarget, draggingId, drop, finish, setActiveTarget, start };
}

export type BlockDndController = ReturnType<typeof useBlockDnd>;

export function isActiveTarget(controller: BlockDndController, target: BlockDropTarget): boolean {
  return !!controller.activeTarget && targetKey(controller.activeTarget) === targetKey(target);
}

export function BlockDropZone({
  axis,
  controller,
  target,
}: {
  axis: Axis;
  controller: BlockDndController;
  target: BlockDropTarget;
}) {
  const active = isActiveTarget(controller, target);
  return (
    <div
      className={`block-drop-zone block-drop-zone-${axis}${active ? " is-active" : ""}`}
      aria-hidden="true"
      data-drop-index={target.index}
      data-drop-parent={target.parentId ?? "root"}
      onDragEnter={(event) => {
        event.preventDefault();
        event.stopPropagation();
        controller.setActiveTarget(target);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        if (!active) controller.setActiveTarget(target);
      }}
      onDragLeave={() => {
        if (active) controller.setActiveTarget(null);
      }}
      onDrop={(event) => controller.drop(event, target)}
    >
      <span>Drop block</span>
    </div>
  );
}
