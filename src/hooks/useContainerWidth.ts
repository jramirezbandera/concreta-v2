import { useCallback, useEffect, useRef, useState } from 'react';

type CallbackRef = (el: HTMLDivElement | null) => void;

/**
 * Returns a callback ref to attach to a container div and the current content
 * width in px. Width updates whenever the element is resized (ResizeObserver).
 *
 * Uses a callback ref (not a ref object) so the observer re-attaches when the
 * target element mounts/unmounts under conditional rendering — required by
 * the rc-beams 'portico' canvas which only mounts when mode !== 'simple'.
 *
 * Backwards compatible: <div ref={canvasRef}> works the same as before since
 * React accepts both ref objects and callback refs in the ref prop.
 */
export function useContainerWidth(): [CallbackRef, number | undefined] {
  const [width, setWidth] = useState<number | undefined>(undefined);
  const observerRef = useRef<ResizeObserver | null>(null);

  const setRef = useCallback<CallbackRef>((el) => {
    // Tear down previous observer when ref unmounts or swaps element.
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (!el) {
      setWidth(undefined);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    observerRef.current = observer;
    setWidth(el.getBoundingClientRect().width);
  }, []);

  // Cleanup on hook unmount.
  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  return [setRef, width];
}
