/**
 * A qué altura cae cada fila de la tabla, para que la sección dibuje el
 * forjado de cada zona justo al lado de su fila.
 *
 * Es la única forma de mantener alineadas dos cosas que crecen distinto: las
 * filas suben y bajan con lo que se teclea (una ficha abierta, un texto que
 * envuelve, una columna nueva) y el dibujo no tiene forma de saberlo. Así que
 * se miden: cada `<tr>` de zona lleva `data-zona` y aquí se lee su posición
 * respecto al contenedor común.
 *
 * `ResizeObserver` cubre lo que cambia de tamaño; el `MutationObserver` cubre
 * lo que aparece y desaparece (abrir la ficha, añadir una planta), que no
 * siempre cambia el tamaño del contenedor.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface CotaFila {
  /** Id de la zona: el `data-zona` de su fila. */
  id: string;
  /** Píxeles desde el borde superior del contenedor. */
  top: number;
  alto: number;
}

export function useCotasFilas<T extends HTMLElement>(deps: unknown[]) {
  const ref = useRef<T>(null);
  const [cotas, setCotas] = useState<CotaFila[]>([]);
  const [alto, setAlto] = useState(0);

  const medir = useCallback(() => {
    const caja = ref.current;
    if (!caja) return;
    const rc = caja.getBoundingClientRect();
    const filas = [...caja.querySelectorAll<HTMLElement>('[data-zona]')].map((fila) => {
      const r = fila.getBoundingClientRect();
      return { id: fila.dataset.zona ?? '', top: r.top - rc.top, alto: r.height };
    });
    // Sólo se vuelve a pintar si algo se ha movido de verdad: medir en cada
    // render dispararía un bucle.
    setCotas((prev) => (mismas(prev, filas) ? prev : filas));
    setAlto((prev) => (Math.abs(prev - rc.height) < CASI ? prev : rc.height));
  }, []);

  useLayoutEffect(medir);

  useEffect(() => {
    const caja = ref.current;
    if (!caja) return;
    const ro = new ResizeObserver(medir);
    ro.observe(caja);
    for (const fila of caja.querySelectorAll('[data-zona]')) ro.observe(fila);
    const mo = new MutationObserver(medir);
    mo.observe(caja, { childList: true, subtree: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
    // Las dependencias las pone quien llama: lo que cambia la tabla (plantas,
    // zonas, columnas, fila abierta) obliga a volver a observar las filas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medir, ...deps]);

  return { ref, cotas, alto, medir };
}

const CASI = 0.5;

function mismas(a: CotaFila[], b: CotaFila[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x.id === b[i].id && Math.abs(x.top - b[i].top) < CASI && Math.abs(x.alto - b[i].alto) < CASI);
}
