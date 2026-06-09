import { type PunchingResult } from '../../lib/calculations/punching';
import { VerdictBadge, CheckRowItem, GroupHeader, ValueRow, overallStatus, ambientStyle } from '../../components/checks';
import { resultLabel } from '../../lib/text/labels';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { formatQuantity } from '../../lib/units/format';

interface PunchingResultsProps {
  result: PunchingResult;
}

const POSITION_LABEL: Record<string, string> = {
  interior: 'Interior',
  borde:    'Borde',
  esquina:  'Esquina',
};

export function PunchingResults({ result }: PunchingResultsProps) {
  const { system } = useUnitSystem();
  // Tensiones en el sistema activo (N/mm² ↔ kg/cm²) — consistente con el toggle global.
  const fmtStress = (v: number) => formatQuantity(v, 'stress', system);

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

        <p className="text-[10px] text-text-secondary mb-2 leading-snug">
          Punzonamiento <strong>conservador de la placa</strong> (placa = área cargada) + datos del
          UPN. El <strong>reparto de la cruceta</strong> (que alarga u1 y baja vEd) lo verifica el
          ingeniero <strong>a mano</strong>: el u1/vEd de aquí es el límite inferior sin reparto.
        </p>

        <GroupHeader label="Cruceta" />
        <ValueRow label="Posición del pilar"               value={`${POSITION_LABEL[c.position] ?? c.position} (${c.nArms} brazos)`} />
        <ValueRow label="Perfil de la cruceta"             value={`UPN ${c.upnSize} (${c.steelGrade})`} />
        <ValueRow label="Clase de sección (EC3)"           value={`Clase ${c.upnClass}`} />
        <ValueRow label="M_Rd — momento resistente UPN (info)" value={`${c.MRd.toFixed(1)} kN·m`} />
        <ValueRow label="Vpl,Rd — cortante plástico UPN (info)" value={`${c.VplRd.toFixed(0)} kN`} />

        <GroupHeader label="Punzonamiento de la placa" />
        <ValueRow label="u0 — perímetro en cara de placa"  value={`${c.u0.toFixed(0)} mm`} />
        <ValueRow label="u1 — perímetro de control (placa, 2d)" value={`${c.u1.toFixed(0)} mm`} />
        <ValueRow label="vRd,c — resistencia"              value={fmtStress(result.vRdc)} />
        <ValueRow label="vEd — actuante en u1 (sin reparto)" value={fmtStress(result.vEd)} />
        <ValueRow label="vRd,max — aplastamiento"          value={fmtStress(result.vRdmax)} />

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
      <ValueRow label="u0 — perímetro en cara del pilar" value={`${result.u0.toFixed(0)} mm`} />
      <ValueRow label={resultLabel('u1_perimeter')}  value={`${result.u1.toFixed(0)} mm`} />
      <ValueRow label="k — factor de tamaño"         value={result.k.toFixed(3)} />
      <ValueRow label="As,sup — armado cara superior" value={`${(result.asSup * 1000).toFixed(0)} mm²/m`} />
      <ValueRow label="As,inf — armado cara inferior" value={`${(result.asInf * 1000).toFixed(0)} mm²/m`} />
      <ValueRow label="ρl — cuantía geométrica efectiva" value={result.rhoL.toFixed(4)} />
      {result.rhoLClamped && (
        <ValueRow label="ρl,mín — cuantía mínima (CE 9.1)" value={result.rhoLMin.toFixed(4)} />
      )}
      <ValueRow label="vmín — resistencia mínima"    value={fmtStress(result.vMin)} />
      <ValueRow label="vEd,0 — tensión en cara del pilar" value={fmtStress(result.vEd0)} />
      <ValueRow label={resultLabel('vEd_punching')}  value={fmtStress(result.vEd)} />

      {/* Resistencias */}
      <GroupHeader label="Resistencias" />
      <ValueRow label={resultLabel('vRd_c_punching')} value={fmtStress(result.vRdc)} />
      <ValueRow label={resultLabel('vRd_max')}        value={fmtStress(result.vRdmax)} />
      <div
        className="overflow-hidden transition-all duration-150"
        style={{ maxHeight: result.vRdcs !== undefined ? '80px' : '0px', opacity: result.vRdcs !== undefined ? 1 : 0 }}
      >
        <ValueRow label="Asw — armado de cercos por fila" value={`${result.aswPerRow.toFixed(0)} mm²`} />
        {result.vRdcs !== undefined && (
          <ValueRow label={resultLabel('vRd_cs')}     value={fmtStress(result.vRdcs)} />
        )}
      </div>
      <ValueRow label="uout — perímetro sin cercos necesarios" value={`${result.uout.toFixed(0)} mm`} />

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
