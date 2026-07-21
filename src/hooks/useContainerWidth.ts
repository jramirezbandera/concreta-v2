import { useCallback, useEffect, useRef, useState } from 'react';

type CallbackRef = (el: HTMLDivElement | null) => void;

/**
 * Returns a callback ref to attach to a container div, the current content
 * width in px, and (third element) the content height. Both update whenever
 * the element is resized (ResizeObserver).
 *
 * Uses a callback ref (not a ref object) so the observer re-attaches when the
 * target element mounts/unmounts under conditional rendering — required by
 * the rc-beams 'portico' canvas which only mounts when mode !== 'simple'.
 *
 * Backwards compatible in two ways: <div ref={canvasRef}> works the same as
 * before (React accepts ref objects and callback refs alike), and the height
 * is APPENDED to the tuple, so the dozen existing `const [ref, w] = …` call
 * sites keep compiling untouched. Only the FEM 2D canvas needs the height (it
 * fits the SVG inside the panel so the panel never scrolls and the wheel can
 * own the zoom gesture) — that did not justify renaming the hook across eight
 * unrelated modules.
 */
export function useContainerWidth(): [CallbackRef, number | undefined, number | undefined] {
  const [size, setSize] = useState<{ w: number; h: number } | undefined>(undefined);
  const observerRef = useRef<ResizeObserver | null>(null);

  const setRef = useCallback<CallbackRef>((el) => {
    // Tear down previous observer when ref unmounts or swaps element.
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (!el) {
      setSize(undefined);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // Skip no-op notifications: a resize that changes neither dimension
        // would otherwise re-render every canvas consumer for nothing.
        setSize((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
      }
    });
    observer.observe(el);
    observerRef.current = observer;
    const rect = el.getBoundingClientRect();
    setSize({ w: rect.width, h: rect.height });
  }, []);

  // Cleanup on hook unmount.
  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  return [setRef, size?.w, size?.h];
}
