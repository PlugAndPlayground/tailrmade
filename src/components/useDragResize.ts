import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

type DragResizeOptions = {
  // Which side the column is anchored to, matching ResizeHandle's prop of the
  // same name: a left-anchored column widens as the pointer moves right, a
  // right-anchored one widens as it moves left.
  isLeft: boolean;
  // the column's current width in px, read when the drag starts
  getStartWidth: () => number;
  // the dragged width in px, before any clamping the caller wants to apply
  onWidth: (width: number) => void;
};

// Pointer-drag resizing for a docked shell column (the menu panel, the
// inspector, the dashboard).
//
// The drag writes a width on every move, which re-renders the caller. The
// window listeners are therefore attached through handlers that never change
// identity - anything that closed over the caller's state would be torn down
// by its own first update, ending the drag after one pixel. The options are
// read back through a ref for the same reason: stable handlers, current
// values.
//
// Clamping is deliberately left to the caller. The panels clamp to a px range
// while the dashboard converts to a percentage of the shell's available width
// first, and folding both into here would take more configuration than it
// saves.
export function useDragResize({
  isLeft,
  getStartWidth,
  onWidth,
}: DragResizeOptions): (e: ReactPointerEvent) => void {
  const optionsRef = useRef({ isLeft, getStartWidth, onWidth });
  optionsRef.current = { isLeft, getStartWidth, onWidth };

  const animationFrameRef = useRef<number | undefined>(undefined);
  const dragStateRef = useRef({ isResizing: false, startWidth: 0, startX: 0 });

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!dragStateRef.current.isResizing) return;

    // coalesce the moves into a single write per frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(() => {
      const delta = optionsRef.current.isLeft
        ? e.clientX - dragStateRef.current.startX
        : dragStateRef.current.startX - e.clientX;
      optionsRef.current.onWidth(dragStateRef.current.startWidth + delta);
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!dragStateRef.current.isResizing) return;

    dragStateRef.current.isResizing = false;

    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  }, [handlePointerMove]);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      e.stopPropagation();

      dragStateRef.current = {
        isResizing: true,
        startWidth: optionsRef.current.getStartWidth(),
        startX: e.clientX,
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [handlePointerMove, handlePointerUp],
  );

  // only on unmount - the handlers are stable, so this never runs mid-drag
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  return handlePointerDown;
}
