import { type PunchingResult } from '../../lib/calculations/punching';
import { VerdictBadge, CheckRowItem, GroupHeader, ValueRow, overallStatus, ambientStyle } from '../../components/checks';
import { resultLabel } from '../../lib/text/labels';

interface PunchingResultsProps {
  result: PunchingResult;
}

const POSITION_LABEL: Record<string, string> = {
  interior: 'Interior',
  borde:    'Borde',
  esquina:  'Esquina',
};

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

  // ── Cruceta mode — dedicated layout ─────────────────────────────────────────
  if (result.cruceta) {
    const c = result.cruceta;
    const status = overallStatus(result.checks);
    return (
      <div
        className="flex flex-col overflow-y-auto rounded px-4 py-3 m-2 transition-colors"
        style={ambientStyle(status)}
      >
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-border-main">
          <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">
            Resultados — crucetas UPN
          </span>
          <VerdictBadge status={status} />
        </div>

        <GroupHeader label="Cruceta" />
        <ValueRow label="Posición"             value={`${POSITION_LABEL[c.position] ?? c.position} (${c.nArms} brazos)`} />
        <ValueRow label="Perfil UPN"           value={`UPN ${c.upnSize} (${c.steelGrade})`} />
        <ValueRow label="Clase sección"        value={`Clase ${c.upnClass}`} />
        <ValueRow label="Longitud brazo L_eff" value={`${c.Leff.toFixed(0)} mm`} />
        <ValueRow label="L_eff,máx (perfil)"   value={`${c.LeffMax.toFixed(0)} mm`} />
        <ValueRow label="Ancho contacto b_eff" value={`${c.bEff.toFixed(0)} mm`} />
        <ValueRow label="M_Rd cruceta"         value={`${c.MRd.toFixed(1)} kN·m`} />

        <GroupHeader label="Parámetros" />
        <ValueRow label="f_jd (aplastamiento)" value={`${c.fjd.toFixed(2)} N/mm²`} />
        {c.Kj > 1.0001 && (
          <ValueRow label="Kj (concentración)" value={c.Kj.toFixed(2)} />
        )}
        <ValueRow label="N de cálculo"         value={`${c.Vdesign.toFixed(0)} kN${c.reliefApplied ? ' (con terreno)' : ''}`} />
        <ValueRow label="Capacidad reparto"    value={`${c.Vcap.toFixed(0)} kN`} />
        <ValueRow label="u0 (placa)"           value={`${c.u0.toFixed(0)} mm`} />
        <ValueRow label="u1 (cruz)"            value={`${c.u1.toFixed(0)} mm`} />
        <ValueRow label="vRd,c"                value={`${result.vRdc.toFixed(3)} N/mm²`} />
        {result.vRdcs !== undefined && (
          <ValueRow label="vRd,cs (con cercos)" value={`${result.vRdcs.toFixed(3)} N/mm²`} />
        )}
        <ValueRow label="vEd (en u1)"          value={`${result.vEd.toFixed(3)} N/mm²`} />

        <GroupHeader label="Verificación" />
        {result.checks.map((ch) => <CheckRowItem key={ch.id} check={ch} />)}
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
      className="flex flex-col overflow-y-auto rounded px-4 py-3 m-2 transition-colors"
      style={ambientStyle(status)}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-border-main">
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">
          Resultados calculados
        </span>
        <VerdictBadge status={status} />
      </div>

      {/* Parámetros */}
      <GroupHeader label="Parámetros" />
      <ValueRow label={resultLabel('beta_punching')} value={result.beta.toFixed(2)} />
      <ValueRow label="u0 (cara del pilar)"          value={`${result.u0.toFixed(0)} mm`} />
      <ValueRow label={resultLabel('u1_perimeter')}  value={`${result.u1.toFixed(0)} mm`} />
      <ValueRow label="k (factor tamaño)"            value={result.k.toFixed(3)} />
      <ValueRow label="As sup"                       value={`${(result.asSup * 1000).toFixed(0)} mm²/m`} />
      <ValueRow label="As inf"                       value={`${(result.asInf * 1000).toFixed(0)} mm²/m`} />
      <ValueRow label="ρl (efectivo)"                value={result.rhoL.toFixed(4)} />
      {result.rhoLClamped && (
        <ValueRow label="ρl,min (CE art. 9.1)"       value={result.rhoLMin.toFixed(4)} />
      )}
      <ValueRow label="vmin"                         value={`${result.vMin.toFixed(3)} N/mm²`} />
      <ValueRow label="vEd,0 (en u0)"                value={`${result.vEd0.toFixed(3)} N/mm²`} />
      <ValueRow label={resultLabel('vEd_punching')}  value={`${result.vEd.toFixed(3)} N/mm²`} />

      {/* Resistencias */}
      <GroupHeader label="Resistencias" />
      <ValueRow label={resultLabel('vRd_c_punching')} value={`${result.vRdc.toFixed(3)} N/mm²`} />
      <ValueRow label={resultLabel('vRd_max')}        value={`${result.vRdmax.toFixed(3)} N/mm²`} />
      <div
        className="overflow-hidden transition-all duration-150"
        style={{ maxHeight: result.vRdcs !== undefined ? '80px' : '0px', opacity: result.vRdcs !== undefined ? 1 : 0 }}
      >
        <ValueRow label="Asw por fila"                value={`${result.aswPerRow.toFixed(0)} mm²`} />
        {result.vRdcs !== undefined && (
          <ValueRow label={resultLabel('vRd_cs')}     value={`${result.vRdcs.toFixed(3)} N/mm²`} />
        )}
      </div>
      <ValueRow label="uout"                          value={`${result.uout.toFixed(0)} mm`} />

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
