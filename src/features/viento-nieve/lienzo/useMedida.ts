/**
 * Tamaño del lienzo por ResizeObserver, el mismo patrón que `MasonryWallsSVG`
 * sacado a un hook para que los cuatro dibujos del módulo no lo repitan.
 *
 * `forceWidth`/`forceHeight` saltan la medición: es lo que usan los tests
 * (el stub de ResizeObserver de `src/test/setup.ts` no mide nada) y lo que
 * usaría una copia fuera de pantalla para exportar.
 */

import { useEffect, useRef, useState } from 'react';

const MINIMO = { w: 360, h: 320 };

export function useMedida(forceWidth?: number, forceHeight?: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 760, h: 600 });
  const forzado = forceWidth != null && forceHeight != null;

  useEffect(() => {
    if (forzado || !ref.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cr = e.contentRect;
        setSize({ w: Math.max(MINIMO.w, cr.width), h: Math.max(MINIMO.h, cr.height) });
      }
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [forzado]);

  return { ref, width: forceWidth ?? size.w, height: forceHeight ?? size.h };
}
