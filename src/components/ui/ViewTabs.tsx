// Pestañas de vista del lienzo — la fila «Modelo · M · V · …» que abre la
// barra superior de los módulos de análisis.
//
// Compartido por FEM 2D y FEM 1D: las dos barras tienen que ser la misma o el
// usuario percibe dos productos distintos. Renderiza SOLO los botones, no la
// barra: cada módulo cuelga después sus propios controles (combinación,
// deshacer, etiquetas) en el mismo contenedor.
//
// La pestaña activa se pinta con el fondo del LIENZO (`bg-bg-primary`), no con
// el acento: así la pestaña «se abre» hacia el lienzo que hay debajo, y el sky
// queda reservado al cálculo vivo.

import type { JSX } from 'react';

export interface ViewTab<T extends string> {
  id: T;
  label: string;
  /** Descripción larga para el tooltip (p. ej. «Diagrama de momentos»). */
  title?: string;
}

interface Props<T extends string> {
  tabs: ReadonlyArray<ViewTab<T>>;
  active: T;
  onSelect: (id: T) => void;
}

export function ViewTabs<T extends string>({ tabs, active, onSelect }: Props<T>): JSX.Element {
  return (
    <>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t.id)}
          aria-pressed={active === t.id}
          title={t.title}
          className={[
            'px-3 py-2 border-r border-border-main text-[11.5px] font-medium tracking-tight whitespace-nowrap transition-colors',
            active === t.id
              ? 'bg-bg-primary text-text-primary'
              : 'bg-bg-surface text-text-secondary hover:bg-bg-elevated/70 hover:text-text-primary',
          ].join(' ')}
        >
          {t.label}
        </button>
      ))}
    </>
  );
}
