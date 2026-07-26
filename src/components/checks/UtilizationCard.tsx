// Tarjeta de veredicto global de un modelo con MUCHOS elementos (FEM 1D y
// FEM 2D): utilización máxima en grande, badge y recuento del modelo.
//
// Los módulos de elemento único (viga, pilar, zapata…) no la usan: allí el
// veredicto es el del propio elemento y vive en su bloque de comprobaciones.
// Aquí el número resume una lista, y por eso necesita decir CUÁNTO resume.

import type { JSX, ReactNode } from 'react';
import { VerdictBadge, ambientStyle } from './index';
import type { CheckStatus } from '../../lib/calculations/types';

const PCT_CLASS: Record<CheckStatus, string> = {
  ok: 'text-state-ok',
  warn: 'text-state-warn',
  fail: 'text-state-fail',
  neutral: 'text-state-neutral',
};

interface Props {
  status: CheckStatus;
  /** η máximo del modelo. `null` cuando todavía no hay comprobaciones → «—». */
  eta: number | null;
  label?: string;
  /** Recuento del modelo, a la derecha del porcentaje ("3 barras · 4 nudos"). */
  meta?: ReactNode;
  /** Filas globales (αcr…) y notas, dentro de la misma tarjeta ambiente. */
  children?: ReactNode;
}

export function UtilizationCard({
  status, eta, label = 'Utilización máxima', meta, children,
}: Props): JSX.Element {
  // El tope en 999 % es de LEGIBILIDAD: un modelo degenerado puede dar η de
  // seis cifras y romper la línea; el veredicto ya es INCUMPLE en cualquier caso.
  const pct = eta === null ? '—' : `${Math.min(eta * 100, 999).toFixed(0)}%`;

  return (
    <div className="mx-2 rounded overflow-hidden transition-colors" style={ambientStyle(status)}>
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border-main">
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">
          {label}
        </span>
        <VerdictBadge status={status} />
      </div>
      <div className="flex items-baseline justify-between gap-2 px-4 py-3 border-b border-border-sub">
        <span className={`font-mono text-2xl font-semibold tabular-nums ${PCT_CLASS[status]}`}>{pct}</span>
        {meta && (
          <span className="font-mono text-[11px] text-text-disabled tabular-nums text-right">{meta}</span>
        )}
      </div>
      {children}
    </div>
  );
}
