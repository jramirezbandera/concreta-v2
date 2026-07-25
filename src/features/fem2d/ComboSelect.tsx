// FEM 2D — desplegable de combinaciones (presentacional).
//
// Sustituye a los tres botones ELU/ELS-c/ELS-cp. Cada uno pintaba una ENVOLVENTE
// (worst-abs punto a punto, un estado que no satisface ningún equilibrio); aquí
// cada entrada concreta dibuja SU estado auditable, comprobable a mano y contra
// CYPE. El componente sólo elige QUÉ se dibuja: el veredicto del panel derecho
// es el de los chequeos y no depende de esta selección (premisa 2).
//
// Puro: recibe las vistas ya construidas (checks.comboViews) y emite el id
// elegido. La resolución de vista obsoleta y el aviso viven en el contenedor.

import type { JSX } from 'react';
import type { Fem2DComboView, Fem2DComboViewId } from './checks';
import { comboOptgroupLabel, comboOptionLabel } from './comboLabels';

export function ComboSelect({
  comboViews,
  activeId,
  disabled,
  onChange,
}: {
  comboViews: Fem2DComboView[];
  activeId: Fem2DComboViewId | undefined;
  disabled: boolean;
  onChange: (id: Fem2DComboViewId) => void;
}): JSX.Element | null {
  if (comboViews.length === 0) return null;

  // Optgroups en orden de emisión (mapa por etiqueta: robusto si un grupo no es
  // contiguo). Envolventes · Combinaciones ELU · Combinaciones ELS · Hipótesis.
  const groups: { label: string; views: Fem2DComboView[] }[] = [];
  for (const v of comboViews) {
    const label = comboOptgroupLabel(v);
    let bucket = groups.find((g) => g.label === label);
    if (!bucket) groups.push((bucket = { label, views: [] }));
    bucket.views.push(v);
  }

  // Móvil (< lg): la etiqueta de la combinación es LARGA ("ELS característica ·
  // 1.00·G + 1.00·Q + 0.60·W" ≈ 378 px) y el <select> cerrado sólo muestra el
  // texto de la opción, sin su optgroup: si no cabe, se corta a media cifra y
  // deja de decir qué se dibuja. Por eso aquí el selector ocupa SU PROPIA fila
  // completa (order-last + basis-full: los iconos suben con las pestañas), sin
  // la píldora "Comb" (el aria-label sigue nombrando el control) y a 12 px.
  // El `!` es necesario: index.css fija `select { font-size: 14px !important }`
  // en < 1023px por ergonomía de toque, y ese tamaño no cabe en un teléfono.
  // Lo que aun así desborde se corta con puntos suspensivos (truncate), nunca
  // a mitad de un factor.
  return (
    <div className="flex min-w-0 items-center gap-1 py-1 pl-3 pr-1 max-lg:order-last max-lg:w-full max-lg:basis-full">
      <span className="hidden shrink-0 pr-1 font-mono text-[9px] uppercase tracking-[0.05em] text-text-disabled lg:inline">Comb</span>
      <select
        aria-label="Combinación a dibujar"
        value={activeId ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Fem2DComboViewId)}
        className="min-w-0 max-w-[26rem] flex-1 truncate rounded border border-border-main bg-bg-elevated px-2 py-2 font-mono text-[12px]! font-semibold text-text-secondary transition-colors hover:text-text-primary focus:border-accent/40 focus:text-text-primary focus:outline-none disabled:opacity-50 lg:flex-none lg:py-1 lg:text-[10.5px]!"
      >
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.views.map((v) => (
              <option key={v.id} value={v.id}>
                {comboOptionLabel(v)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
