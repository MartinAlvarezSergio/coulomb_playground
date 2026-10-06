import { RefObject, useEffect, useRef, useState } from "react";

/**
 * Keep each canvas's backing store at device resolution as its CSS size changes.
 * Draw in logical units with `setLogicalTransform` (core/canvasScale). Resizing clears a
 * canvas, so applets that only redraw on change pass `onResize` to repaint.
 */
export function useCanvasBackingStore(
  refs: RefObject<HTMLCanvasElement>[],
  onResize?: () => void
): void {
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  useEffect(() => {
    const fit = (canvas: HTMLCanvasElement): boolean => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width === w && canvas.height === h) {
        return false;
      }
      canvas.width = w;
      canvas.height = h;
      return true;
    };
    const canvases = refs.map((r) => r.current).filter((c): c is HTMLCanvasElement => c !== null);
    const observer = new ResizeObserver(() => {
      let changed = false;
      for (const c of canvases) {
        changed = fit(c) || changed;
      }
      if (changed) {
        onResizeRef.current?.();
      }
    });
    for (const c of canvases) {
      observer.observe(c);
    }
    return () => observer.disconnect();
    // The refs are stable objects; their targets are read once the stage has mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Floating tooltip for any `[data-hover-help]` element inside `rootRef`. */
export function useHoverHelp(rootRef: RefObject<HTMLElement>): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    // Lives inside the root so it still shows when the root is full screen.
    const tooltip = document.createElement("div");
    tooltip.className = "hover-help-tooltip";
    root.appendChild(tooltip);

    const placeTooltip = (x: number, y: number): void => {
      const offset = 14;
      const maxX = window.innerWidth - tooltip.offsetWidth - 8;
      const maxY = window.innerHeight - tooltip.offsetHeight - 8;
      const left = Math.min(Math.max(8, x + offset), Math.max(8, maxX));
      const top = Math.min(Math.max(8, y + offset), Math.max(8, maxY));
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    };

    const onMouseMove = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null;
      const hintTarget = target?.closest?.("[data-hover-help]") as HTMLElement | null;
      const hint = hintTarget && root.contains(hintTarget) ? hintTarget.getAttribute("data-hover-help") : null;
      if (!hint) {
        tooltip.classList.remove("visible");
        return;
      }
      tooltip.textContent = hint;
      tooltip.classList.add("visible");
      placeTooltip(event.clientX, event.clientY);
    };

    const onMouseLeave = (): void => {
      tooltip.classList.remove("visible");
    };

    root.addEventListener("mousemove", onMouseMove);
    root.addEventListener("mouseleave", onMouseLeave);
    return () => {
      root.removeEventListener("mousemove", onMouseMove);
      root.removeEventListener("mouseleave", onMouseLeave);
      tooltip.remove();
    };
  }, [rootRef]);
}

export function useFullscreen(targetRef: RefObject<HTMLElement>): {
  isFullscreen: boolean;
  toggleFullscreen: () => void;
} {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = (): void => setIsFullscreen(document.fullscreenElement === targetRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [targetRef]);

  const toggleFullscreen = (): void => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void targetRef.current?.requestFullscreen?.().catch(() => {});
    }
  };

  return { isFullscreen, toggleFullscreen };
}

export function useEscapeKey(active: boolean, onEscape: () => void): void {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) {
      return;
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onEscapeRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);
}
