/**
 * Qué dirección de la acción se está mirando: la píldora «● según X / ○ según Y».
 *
 * Los módulos de acciones tienen todos la misma pregunta —el viento empuja
 * según X o según Y, el sismo se reparte en una dirección o en la otra— y la
 * respuesta gobierna lo que se dibuja. Antes cada uno la pintaba a su manera:
 * viento y nieve con esta píldora y sismo con dos cajas grises que no se
 * parecían a nada del resto de la app. Dos maneras de preguntar lo mismo es lo
 * que hace que dos pantallas del mismo capítulo parezcan dos productos.
 *
 * El disco relleno/vacío no es adorno: dice cuál está activa sin depender del
 * color, que es lo que necesita quien no distingue el azul del gris.
 *
 * NO es `ViewTabs`, y no debería acabar siéndolo: aquélla reparte el lienzo en
 * vistas —qué dibujo miro— y ésta elige un dato del cálculo que atraviesa TODOS
 * los dibujos a la vez. Por eso vive abajo y a la derecha, pegada a la leyenda
 * de la figura, y no arriba con las pestañas.
 */

import type { JSX } from 'react';

export interface OpcionDireccion<T extends string> {
  id: T;
  /** Lo que se lee en el botón: «según X», o «θ = 0º · según X» cuando hay cubierta. */
  etiqueta: string;
}

interface Props<T extends string> {
  opciones: ReadonlyArray<OpcionDireccion<T>>;
  activa: T;
  onSelect: (id: T) => void;
  /** Rótulo del grupo para quien navega a ciegas. Por defecto, «Dirección». */
  rotulo?: string;
}

export function SelectorDireccion<T extends string>({
  opciones,
  activa,
  onSelect,
  rotulo = 'Dirección',
}: Props<T>): JSX.Element {
  return (
    <span role="group" aria-label={rotulo} className="flex items-center gap-1.5">
      {opciones.map((o) => {
        const esActiva = activa === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onSelect(o.id)}
            aria-pressed={esActiva}
            className="cursor-pointer rounded border px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors"
            style={{
              background: esActiva ? 'color-mix(in srgb, var(--color-accent) 18%, transparent)' : 'transparent',
              borderColor: esActiva ? 'var(--color-accent)' : 'var(--color-text-disabled)',
              color: esActiva ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              letterSpacing: '0.04em',
            }}
          >
            {esActiva ? '●' : '○'} {o.etiqueta}
          </button>
        );
      })}
    </span>
  );
}
