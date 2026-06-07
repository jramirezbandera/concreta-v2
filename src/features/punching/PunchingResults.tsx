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

        <p className="text-[10px] text-state-warn mb-2 leading-snug">
          ⚠ Modelo interino: cruz embebida con apoyo a fcd (sin confinamiento &gt;fcd por §6.7).
          El anclaje (soldadura pasante) y el atado (reparto sup) se cubren con el detalle si se
          marcan en "Detalle de armado". El cortante de interfaz en el plano de la cruz (delaminación)
          sigue sin cláusula que lo calcule: verificar a mano.
        </p>

        <GroupHeader label="Cruceta" />
        <ValueRow label="Posición del pilar"               value={`${POSITION_LABEL[c.position] ?? c.position} (${c.nArms} brazos)`} />
        <ValueRow label="Perfil de la cruceta"             value={`UPN ${c.upnSize} (${c.steelGrade})`} />
        <ValueRow label="Clase de sección (EC3)"           value={`Clase ${c.upnClass}`} />
        <ValueRow label="L_eff — longitud eficaz del brazo" value={`${c.Leff.toFixed(0)} mm`} />
        <ValueRow label="L_brazo (auto) — luz/8, ≥50cm"    value={`${c.LeffMax.toFixed(0)} mm`} />
        <ValueRow label="b_eff — ancho de contacto eficaz" value={`${c.bEff.toFixed(0)} mm`} />
        <ValueRow label="M_Rd — momento resistente cruceta" value={`${c.MRd.toFixed(1)} kN·m`} />

        <GroupHeader label="Parámetros" />
        <ValueRow label="f apoyo — tensión de apoyo (= fcd)" value={`${c.fjd.toFixed(2)} N/mm²`} />
        <ValueRow label="N — axil de cálculo"              value={`${c.Vdesign.toFixed(0)} kN${c.reliefApplied ? ' (con descuento de terreno)' : ''}`} />
        <ValueRow label="V_cap — capacidad de reparto"     value={`${c.Vcap.toFixed(0)} kN`} />
        <ValueRow label="u0 — perímetro de la placa"       value={`${c.u0.toFixed(0)} mm`} />
        <ValueRow label="u1 — perímetro de control (cruz)" value={`${c.u1.toFixed(0)} mm`} />
        <ValueRow label="vRd,c — resistencia sin cercos"   value={`${result.vRdc.toFixed(3)} N/mm²`} />
        {result.vRdcs !== undefined && (
          <ValueRow label="vRd,cs — resistencia con cercos" value={`${result.vRdcs.toFixed(3)} N/mm²`} />
        )}
        <ValueRow label="vEd — tensión actuante en u1"     value={`${result.vEd.toFixed(3)} N/mm²`} />

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
      <ValueRow label="vmín — resistencia mínima"    value={`${result.vMin.toFixed(3)} N/mm²`} />
      <ValueRow label="vEd,0 — tensión en cara del pilar" value={`${result.vEd0.toFixed(3)} N/mm²`} />
      <ValueRow label={resultLabel('vEd_punching')}  value={`${result.vEd.toFixed(3)} N/mm²`} />

      {/* Resistencias */}
      <GroupHeader label="Resistencias" />
      <ValueRow label={resultLabel('vRd_c_punching')} value={`${result.vRdc.toFixed(3)} N/mm²`} />
      <ValueRow label={resultLabel('vRd_max')}        value={`${result.vRdmax.toFixed(3)} N/mm²`} />
      <div
        className="overflow-hidden transition-all duration-150"
        style={{ maxHeight: result.vRdcs !== undefined ? '80px' : '0px', opacity: result.vRdcs !== undefined ? 1 : 0 }}
      >
        <ValueRow label="Asw — armado de cercos por fila" value={`${result.aswPerRow.toFixed(0)} mm²`} />
        {result.vRdcs !== undefined && (
          <ValueRow label={resultLabel('vRd_cs')}     value={`${result.vRdcs.toFixed(3)} N/mm²`} />
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
