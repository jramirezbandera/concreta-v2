/**
 * Piezas de la columna de datos: el campo apilado (etiqueta arriba, control a
 * todo el ancho, nota de ayuda debajo) y las notas de sección. En 288 px no
 * cabe la rejilla de cuatro columnas del formulario antiguo: cada pregunta va
 * en su fila, y la explicación larga en el tooltip ⓘ o en dos líneas cortas
 * que sólo aparecen con el modo Ayuda.
 */

import type { ReactNode } from 'react';

// El campo apilado vive ahora en `components/ui/Campo` (lo comparte la ficha
// DB SE, que le trae los cuatro estados); aquí se re-exporta tal cual.
export { Campo } from '../../components/ui/Campo';

/** Explicación de una sección en modo Ayuda: dos o tres líneas, no un párrafo. */
export function NotaSeccion({ children }: { children: ReactNode }) {
  return <p className="text-[10.5px] leading-snug text-text-disabled">{children}</p>;
}

/** Fila «pregunta · interruptor» que abre o cierra un bloque opcional. */
export function FilaInterruptor({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-text-secondary">{etiqueta}</span>
      {children}
    </div>
  );
}

/** Cabecera pequeña de una lista dentro de la sección (plantas, faldones). */
export function CabeceraLista({ children }: { children: ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">{children}</p>;
}
