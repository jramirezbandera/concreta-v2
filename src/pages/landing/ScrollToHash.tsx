// ScrollToHash — scrolls to the element named by location.hash.
// React Router does not restore hash scroll on client navigation, so the
// landing mounts this to make `/#section` links (from the nav, footer, or the
// /normativa subpage) actually land on the right section.

import { useEffect } from 'react';
import { useLocation } from 'react-router';

export function ScrollToHash() {
  // `key` changes on every navigation, so re-clicking the same hash re-scrolls.
  const { hash, key } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    let raf = 0;

    // The landing's hero/carousel can shift section offsets after first paint;
    // retry across a few frames until the target has laid out.
    const tryScroll = (attempt: number) => {
      const el = document.getElementById(id);
      if (el) {
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      } else if (attempt < 5) {
        raf = requestAnimationFrame(() => tryScroll(attempt + 1));
      }
    };

    raf = requestAnimationFrame(() => tryScroll(0));
    return () => cancelAnimationFrame(raf);
  }, [hash, key]);

  return null;
}
