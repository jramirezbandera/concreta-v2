// FEM 1D — cabecera del panel de resultados.
//
// Una sola fila de 36 px, nunca una pila de chips a todo el ancho:
//   ‹ Modelo · [CUMPLE] 87%                       (sin barra seleccionada)
//   ‹ Barra b1 · HA · [INCUMPLE] 119% · [vano │ apoyo]   (barra de HA)
//   ‹ Modelo · [—]                                (modelo sin comprobaciones)
//
// El badge es el <VerdictBadge> compartido: el veredicto del FEM se escribe
// con las mismas palabras que el de cualquier otro módulo. El η va FUERA del
// badge — el badge dice si cumple, el número dice por cuánto.

import type { JSX } from 'react';
import { ChevronLeft } from 'lucide-react';
import { VerdictBadge } from '../../../components/checks';
import { barStatusToCheck } from '../checkMapping';
import type { DesignBar, SolveResult } from '../types';

interface Props {
  result: SolveResult;
  selectedBar: DesignBar | undefined;
  activeSection: 'vano' | 'apoyo';
  setActiveSection: (s: 'vano' | 'apoyo') => void;
  /** Vuelve al resumen del modelo. Ausente ⇒ no se pinta el botón. */
  onBack?: () => void;
}

export function ResultsHeader({
  result, selectedBar, activeSection, setActiveSection, onBack,
}: Props): JSX.Element {
  // El veredicto en la cabecera es el DEL MODELO, y solo cuando el modelo es el
  // sujeto. Con una barra abierta se quita: el módulo embebido pinta su propio
  // bloque de veredicto tres píxeles más abajo, y en 300 px el badge repetido
  // le comía el ancho al nombre de la barra (quedaba en «B…»).
  const status = barStatusToCheck(result.status);
  const showVerdict = !selectedBar;
  const showEta = showVerdict && status !== 'neutral' && result.maxEta > 0;

  return (
    <div
      role="region"
      aria-label="Resultado del modelo"
      // pl-8 en lg: deja sitio al CollapseToggle (absolute, left:6, 20px) que
      // solo se monta en escritorio; sin él el toggle taparía la "M" de "Modelo".
      className="flex h-9 shrink-0 items-center gap-3 border-b border-border-main bg-bg-surface px-4 lg:pl-8"
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          title="Volver al modelo"
          aria-label="Volver al modelo"
          className="-ml-1.5 shrink-0 rounded p-0.5 text-text-disabled transition-colors hover:text-accent"
        >
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
      )}

      <span className="min-w-0 truncate font-mono text-[12px] font-medium text-text-primary">
        {selectedBar
          ? `Barra ${selectedBar.id} · ${selectedBar.material === 'rc' ? 'HA' : 'Acero'}`
          : 'Modelo'}
      </span>

      {showVerdict && <VerdictBadge status={status} />}

      {showEta && (
        <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-text-secondary">
          {(result.maxEta * 100).toFixed(0)}%
        </span>
      )}

      {/* Vano/Apoyo — solo en barras de hormigón. */}
      {selectedBar?.material === 'rc' && (
        <div role="tablist" aria-label="Sección" className="ml-auto inline-flex shrink-0">
          {(['vano', 'apoyo'] as const).map((s) => {
            const active = activeSection === s;
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveSection(s)}
                className={`rounded px-2 py-0.5 font-mono text-[10px] capitalize transition-colors ${
                  active ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
