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

  return (
    <div className="flex items-center gap-1 py-1 pl-3 pr-1">
      <span className="pr-1 font-mono text-[9px] uppercase tracking-[0.05em] text-text-disabled">Comb</span>
      <select
        aria-label="Combinación a dibujar"
        value={activeId ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Fem2DComboViewId)}
        className="max-w-[15rem] rounded border border-border-main bg-bg-elevated px-2 py-1 font-mono text-[10.5px] font-semibold text-text-secondary transition-colors hover:text-text-primary focus:border-accent/40 focus:text-text-primary focus:outline-none disabled:opacity-50"
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
