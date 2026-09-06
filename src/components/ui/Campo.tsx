/**
 * El campo apilado del capítulo Memorias y Acciones: etiqueta arriba, control a
 * todo el ancho, nota de ayuda debajo. En 288 px no cabe una rejilla de cuatro
 * columnas: cada pregunta va en su fila y la explicación larga en el tooltip
 * ⓘ, o en dos líneas cortas que sólo aparecen con el modo Ayuda.
 *
 * Nació en Viento y nieve (`features/viento-nieve/campos.tsx`) y lo comparte
 * con la ficha DB SE, que le trae el `estado` de los cuatro estados del diseño
 * de Memorias: rojo = hueco (bloquea), ámbar = heredado o por revisar
 * (bloquea), azul = lo puso la norma o una publicación, normal = confirmado.
 * `hueco` y `derivado` siguen valiendo como atajo para quien no tiene estados.
 */

import type { ReactNode } from 'react';
import type { Estado } from '../../lib/memoria/model';
import { HelpTooltip } from './HelpTooltip';
import { AMBAR, HUECO } from './estados';

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
  /** El estado de la ficha DB SE; manda sobre `hueco` y `derivado`. */
  estado?: Estado;
  /** Algo a la derecha de la etiqueta: el botón «Confirmar», el chip de origen. */
  accion?: ReactNode;
  children: ReactNode;
}

export function Campo({ etiqueta, ayuda, nota, hueco = false, derivado = false, estado, accion, children }: CampoProps) {
  const e: Estado = estado ?? (hueco ? 'falta' : derivado ? 'derivado' : 'ok');
  const color = e === 'falta' ? 'text-state-fail' : e === 'heredado' || e === 'revisar' ? 'text-state-warn' : e === 'derivado' ? 'text-accent' : 'text-text-secondary';
  const tinte = e === 'falta' ? HUECO : e === 'heredado' || e === 'revisar' ? AMBAR : undefined;
  return (
    <div className={['flex min-w-0 flex-col gap-1', tinte ? '-mx-1 rounded px-1 py-0.5' : ''].join(' ')} style={tinte}>
      <span className={`flex items-center gap-1 text-[11px] ${color}`}>
        {etiqueta}
        {ayuda ? <HelpTooltip text={ayuda} fieldLabel={etiqueta} /> : null}
        {accion ? <span className="ml-auto flex items-center gap-1">{accion}</span> : null}
      </span>
      {children}
      {nota ? <p className="text-[10px] leading-tight text-text-disabled">{nota}</p> : null}
    </div>
  );
}
