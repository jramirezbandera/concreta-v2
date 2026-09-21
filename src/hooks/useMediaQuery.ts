import { useEffect, useState } from 'react';

/**
 * Se suscribe a una media query y devuelve si casa ahora mismo.
 *
 * El primer valor sale de `matchMedia` en el propio render, no de un efecto:
 * así la primera pintura ya reparte el sitio como toca y no hay un salto de
 * layout al montar. `useIsMobile` es este mismo hook con la consulta fijada.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza un cambio ocurrido entre el primer render y el efecto
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
