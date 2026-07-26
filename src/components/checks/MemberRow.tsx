// Fila de un elemento dentro de una lista de veredictos (FEM 1D y FEM 2D).
//
// Tipada contra una FORMA MÍNIMA (id/status/eta/checks), no contra el veredicto
// de un módulo concreto: cada módulo trae su propio tipo y lo proyecta aquí.
// El estado ya llega mapeado a CheckStatus — «pendiente» es 'neutral', que es
// lo que entienden el badge y las filas compartidas.

import { useState, type JSX } from 'react';
import { ChevronRight, Maximize2 } from 'lucide-react';
import { CheckRowItem } from './index';
import type { CheckRow, CheckStatus } from '../../lib/calculations/types';

export interface MemberRowData {
  id: string;
  status: CheckStatus;
  eta: number;
  checks: CheckRow[];
  /** Etiqueta corta junto al id (el 1D distingue barras de HA y de acero). */
  tag?: string;
}

const PCT_CLASS: Record<CheckStatus, string> = {
  ok: 'text-state-ok',
  warn: 'text-state-warn',
  fail: 'text-state-fail',
  neutral: 'text-state-neutral',
};

interface Props {
  data: MemberRowData;
  isSelected?: boolean;
  /** Pulsar la fila la despliega; si además hay `onSelect`, la selecciona. */
  onSelect?: (id: string) => void;
  /** Icono de ficha, a la derecha. Ausente ⇒ no se pinta el botón. */
  onOpenDetail?: (id: string) => void;
  detailTitle?: string;
  /** Texto del desplegable cuando el elemento no tiene comprobaciones. */
  emptyLabel?: string;
}

export function MemberRow({
  data, isSelected, onSelect, onOpenDetail,
  detailTitle = 'Ficha de cálculo',
  emptyLabel = 'Sin comprobaciones todavía.',
}: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  // >100 % se dice con la palabra, no con el número: en una columna de ~48 px
  // «INCUMPLE» se lee de un vistazo y el η exacto lo da la ficha.
  const pct = data.status === 'neutral'
    ? '—'
    : data.eta <= 1 ? `${(data.eta * 100).toFixed(0)}%` : 'INCUMPLE';

  return (
    <div className="border-b border-border-sub last:border-b-0">
      {/* El icono de ficha vive FUERA del botón principal (button-in-button es
          HTML inválido): fila = flex de dos botones que comparten el hover. */}
      <div className={`flex items-center transition-colors ${isSelected ? 'bg-accent/10' : 'hover:bg-bg-elevated/50'}`}>
        <button
          type="button"
          onClick={() => {
            setOpen((o) => !o);
            onSelect?.(data.id);
          }}
          aria-expanded={open}
          className="min-w-0 flex-1 flex items-center gap-2 px-4 py-2 text-left max-md:min-h-11"
        >
          <ChevronRight size={13} className={`shrink-0 text-text-disabled transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
          <span className={`font-mono text-[11px] min-w-0 truncate ${isSelected ? 'text-accent' : 'text-text-primary'}`}>
            {data.id}
          </span>
          {data.tag && (
            <span className="shrink-0 text-[10px] uppercase tracking-[0.04em] text-text-disabled">{data.tag}</span>
          )}
          <span className={`ml-auto font-mono text-[11px] font-semibold tabular-nums shrink-0 ${PCT_CLASS[data.status]}`}>{pct}</span>
        </button>
        {onOpenDetail && (
          <button
            type="button"
            onClick={() => onOpenDetail(data.id)}
            title={detailTitle}
            aria-label={`${detailTitle} de ${data.id}`}
            className="shrink-0 p-2 mr-1 rounded text-text-disabled hover:text-accent transition-colors max-md:min-h-11"
          >
            <Maximize2 size={12} aria-hidden="true" />
          </button>
        )}
      </div>
      {open && (
        <div className="pb-1">
          {data.checks.length === 0 ? (
            <p className="px-4 py-2 text-[11px] italic text-text-disabled leading-snug">{emptyLabel}</p>
          ) : (
            data.checks.map((c) => <CheckRowItem key={c.id} check={c} compact />)
          )}
        </div>
      )}
    </div>
  );
}
