import { type PunchingResult } from '../../lib/calculations/punching';
import { VerdictBadge, CheckRowItem, GroupHeader, ValueRow, BORDER_CLASSES, overallStatus } from '../../components/checks';

interface PunchingResultsProps {
  result: PunchingResult;
}

export function PunchingResults({ result }: PunchingResultsProps) {
  if (!result.valid && result.error) {
    return (
      <div className="flex flex-col overflow-y-auto px-4 py-3">
        <div className="rounded border border-state-fail/40 px-4 py-3">
          <p className="text-[12px] text-state-fail">{result.error}</p>
        </div>
      </div>
    );
  }

  const status = overallStatus(result.checks);

  const alwaysChecks = result.checks.filter((c) =>
    ['punz-rho-min', 'punz-ved-max', 'punz-ved-vrdc'].includes(c.id),
  );
  const shearChecks = result.checks.filter((c) => ['punz-sr-max', 'punz-ved-vrdcs'].includes(c.id));

  return (
    <div
      className={[
        'flex flex-col overflow-y-auto rounded border px-4 py-3 m-2 transition-colors',
        `border-2 ${BORDER_CLASSES[status]}`,
      ].join(' ')}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-border-main">
        <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-text-secondary">
          Punzonamiento
        </span>
        <VerdictBadge status={status} />
      </div>

      {/* Parámetros */}
      <GroupHeader label="Parámetros" />
      <ValueRow label="β (excentricidad)"        value={result.beta.toFixed(2)} />
      <ValueRow label="u1 (perímetro crítico)"    value={`${result.u1.toFixed(0)} mm`} />
      <ValueRow label="k (factor tamaño)"         value={result.k.toFixed(3)} />
      <ValueRow label="As sup"                    value={`${(result.asSup * 1000).toFixed(0)} mm²/m`} />
      <ValueRow label="As inf"                    value={`${(result.asInf * 1000).toFixed(0)} mm²/m`} />
      <ValueRow label="ρl (efectivo)"             value={result.rhoL.toFixed(4)} />
      {result.rhoLClamped && (
        <ValueRow label="ρl,min (CE art. 9.1)"   value={result.rhoLMin.toFixed(4)} />
      )}
      <ValueRow label="vmin"                      value={`${result.vMin.toFixed(3)} MPa`} />
      <ValueRow label="vEd"                       value={`${result.vEd.toFixed(3)} MPa`} />

      {/* Resistencias */}
      <GroupHeader label="Resistencias" />
      <ValueRow label="vRd,c (sin cercos)"        value={`${result.vRdc.toFixed(3)} MPa`} />
      <ValueRow label="vRd,max (máximo)"          value={`${result.vRdmax.toFixed(3)} MPa`} />
      <div
        className="overflow-hidden transition-all duration-150"
        style={{ maxHeight: result.vRdcs !== undefined ? '80px' : '0px', opacity: result.vRdcs !== undefined ? 1 : 0 }}
      >
        <ValueRow label="Asw por fila"            value={`${result.aswPerRow.toFixed(0)} mm²`} />
        {result.vRdcs !== undefined && (
          <ValueRow label="vRd,cs (con cercos)"   value={`${result.vRdcs.toFixed(3)} MPa`} />
        )}
      </div>
      <ValueRow label="uout"                      value={`${result.uout.toFixed(0)} mm`} />

      {/* Verificación */}
      <GroupHeader label="Verificación" />
      {alwaysChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}
      {shearChecks.length > 0 && (
        <>
          <GroupHeader label="Con armado de punzonamiento" />
          {shearChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}
        </>
      )}
    </div>
  );
}
