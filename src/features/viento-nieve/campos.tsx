/**
 * Piezas de la columna de datos: el campo apilado (etiqueta arriba, control a
 * todo el ancho, nota de ayuda debajo) y las notas de sección. En 288 px no
 * cabe la rejilla de cuatro columnas del formulario antiguo: cada pregunta va
 * en su fila, y la explicación larga en el tooltip ⓘ o en dos líneas cortas
 * que sólo aparecen con el modo Ayuda.
 */

import type { ReactNode } from 'react';
import { HelpTooltip } from '../../components/ui/HelpTooltip';
import { HUECO } from './estilos';

interface CampoProps {
  etiqueta: string;
  /** Texto del tooltip ⓘ. */
  ayuda?: string;
  /** Nota corta bajo el control; el que llama la pasa sólo con el modo Ayuda encendido. */
  nota?: string;
  /** Hueco sin resolver: bloquea publicar y exportar. */
  hueco?: boolean;
  /** Valor que pone la norma, no el usuario. */
  derivado?: boolean;
  children: ReactNode;
}

export function Campo({ etiqueta, ayuda, nota, hueco = false, derivado = false, children }: CampoProps) {
  const color = hueco ? 'text-state-fail' : derivado ? 'text-accent' : 'text-text-secondary';
  return (
    <div className={['flex min-w-0 flex-col gap-1', hueco ? '-mx-1 rounded px-1 py-0.5' : ''].join(' ')} style={hueco ? HUECO : undefined}>
      <span className={`flex items-center gap-1 text-[11px] ${color}`}>
        {etiqueta}
        {ayuda ? <HelpTooltip text={ayuda} fieldLabel={etiqueta} /> : null}
      </span>
      {children}
      {nota ? <p className="text-[10px] leading-tight text-text-disabled">{nota}</p> : null}
    </div>
  );
}

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
