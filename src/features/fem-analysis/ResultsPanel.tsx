// FEM 1D — panel de resultados (columna derecha).
//
// Monta, de arriba abajo:
//   - <ResultsHeader> siempre (fila de 36 px con el veredicto vivo)
//   - modelo irresoluble → <ErrorAmbient> (compartido con el 2D)
//   - barra seleccionada → el módulo real embebido (RcBarResults/SteelBarResults)
//   - sin selección     → resumen del modelo
//
// El resumen habla el mismo idioma que el del FEM 2D —tarjeta de utilización
// máxima y filas desplegables— sobre las piezas de components/checks, y añade
// los dos bloques que el 2D no tiene: REACCIONES (por combinación) y NORMATIVA.

import { GroupHeader, ValueRow } from '../../components/checks';
import { MemberRow } from '../../components/checks/MemberRow';
import { UtilizationCard } from '../../components/checks/UtilizationCard';
import { ErrorAmbient } from '../../components/ui/ErrorAmbient';
import { formatQuantity } from '../../lib/units/format';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { barCheckRows, barStatusToCheck } from './checkMapping';
import { ResultsHeader } from './embedded/ResultsHeader';
import { RcBarResults } from './embedded/RcBarResults';
import { SteelBarResults } from './embedded/SteelBarResults';
import type {
  BarResult,
  DesignBar,
  DesignModel,
  ReactionsByCombo,
  Selected,
  SolveResult,
} from './types';

/** Las cuatro envolventes que puede pedir el panel. Atada a la estructura de
 *  reacciones — que es justo lo que indexa — y no al `ComboCode` heredado del
 *  modelo, que solo tiene tres valores y con otros literales. */
type ComboKey = keyof ReactionsByCombo;

interface Props {
  model: DesignModel;
  result: SolveResult;
  selected: Selected;
  setSelected: (s: Selected) => void;
  activeSection: 'vano' | 'apoyo';
  setActiveSection: (s: 'vano' | 'apoyo') => void;
  /** Combo selected in topbar canvas — drives which reactions envelope to show. */
  combo: ComboKey;
}

export function ResultsPanel({
  model, result, selected, setSelected, activeSection, setActiveSection, combo,
}: Props) {
  const selectedBar = selected?.kind === 'bar'
    ? model.bars.find((b) => b.id === selected.id)
    : undefined;
  const selectedBarResult = selectedBar ? result.perBar[selectedBar.id] : undefined;

  // Decide unsolvable: solver-level fail errors (mecanismo, sin apoyos, ...).
  const failErrors = result.errors.filter((e) => e.severity === 'fail');

  // El panel NO lleva ambiente propio: lo pone quien manda en cada estado —la
  // tarjeta de utilización, el bloque de error o el módulo embebido—. Antes lo
  // ponía además la raíz y salían DOS filetes de color a 36 px uno del otro.
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ResultsHeader
        result={result}
        selectedBar={selectedBar}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        onBack={selectedBar ? () => setSelected(null) : undefined}
      />

      {failErrors.length > 0 ? (
        <ErrorAmbient
          title="Modelo no resoluble"
          message={failErrors[0]?.msg}
          details={failErrors.slice(1).map((e) => e.msg)}
          hint="Corrige los errores en el lienzo para recuperar las comprobaciones."
        />
      ) : selectedBar ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {selectedBar.material === 'rc'
            ? <RcBarResults barResult={selectedBarResult} activeSection={activeSection} />
            : <SteelBarResults barResult={selectedBarResult} bar={selectedBar} />}
        </div>
      ) : (
        <ModelSummary
          model={model}
          result={result}
          setSelected={setSelected}
          combo={combo}
        />
      )}
    </div>
  );
}

const COMBO_LABEL: Record<ComboKey, string> = {
  ELU: 'ELU',
  ELS_c: 'ELS-c',
  ELS_frec: 'ELS-frec',
  ELS_cp: 'ELS-cp',
};

const NORMATIVA: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Hormigón', value: 'CE 2021' },
  { label: 'Acero',    value: 'CTE DB-SE-A · CE Anejo 22' },
  { label: 'Acciones', value: 'CTE DB-SE' },
];

// ── Sin barra seleccionada: resumen del modelo ──────────────────────────────

function ModelSummary({
  model, result, setSelected, combo,
}: {
  model: DesignModel;
  result: SolveResult;
  setSelected: (s: Selected) => void;
  combo: ComboKey;
}) {
  const { system } = useUnitSystem();
  // V1.1 R9: reactions list reflects the combo selector. Falls back to summed
  // `reactions` if the new envelope structure isn't present.
  const reactionsForCombo = result.reactionsByCombo?.[combo] ?? result.reactions;
  const ranked = model.bars
    .map((b) => ({ b, r: result.perBar[b.id] }))
    .filter((x): x is { b: DesignBar; r: BarResult } => !!x.r)
    .sort((a, b) => (b.r.eta || 0) - (a.r.eta || 0));

  const status = barStatusToCheck(result.status);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2 py-3">
      <UtilizationCard
        status={status}
        eta={status === 'neutral' ? null : result.maxEta}
        meta={`${model.bars.length} barras · ${model.nodes.length} nudos`}
      />

      <div className="mx-2 overflow-hidden rounded border border-border-main">
        <GroupHeader label="Verificación por barra" />
        {ranked.length === 0 ? (
          <p className="px-4 py-3 text-[11px] italic leading-snug text-text-disabled">
            Sin resultados todavía. Añade armado a las barras.
          </p>
        ) : (
          ranked.map(({ b, r }) => (
            <MemberRow
              key={b.id}
              data={{
                id: b.id,
                tag: b.material === 'rc' ? 'HA' : 'Acero',
                status: barStatusToCheck(r.status),
                eta: r.eta,
                checks: barCheckRows(b, r),
              }}
              onOpenDetail={(id) => setSelected({ kind: 'bar', id })}
              detailTitle="Ficha de cálculo"
              emptyLabel="Comprobaciones pendientes — completa el armado de la barra."
            />
          ))
        )}
      </div>

      {ranked.length > 0 && (
        <p className="mx-2 px-2 text-[10px] leading-snug text-text-disabled">
          Despliega una barra para ver sus comprobaciones; el icono abre la ficha completa.
        </p>
      )}

      {reactionsForCombo.length > 0 && (
        <div className="mx-2 overflow-hidden rounded border border-border-main">
          <GroupHeader label="Reacciones" right={COMBO_LABEL[combo]} />
          {reactionsForCombo.map((r, i) => (
            <ValueRow
              key={i}
              label={r.node}
              value={`Ry=${formatQuantity(r.Ry, 'force', system)}${r.Mr ? ` · M=${formatQuantity(r.Mr, 'moment', system)}` : ''}`}
            />
          ))}
        </div>
      )}

      <div className="mx-2 overflow-hidden rounded border border-border-main">
        <GroupHeader label="Normativa" />
        {NORMATIVA.map((r) => <ValueRow key={r.label} label={r.label} value={r.value} />)}
      </div>

      <div className="mx-2 px-2">
        <p className="text-[10px] leading-snug text-text-disabled">
          Análisis lineal de viga continua (rigidez directa) · envolventes CTE ELU y ELS ·
          comprobaciones por barra con los motores de HA y acero. Predimensionamiento —
          no sustituye un cálculo completo.
        </p>
      </div>
    </div>
  );
}
