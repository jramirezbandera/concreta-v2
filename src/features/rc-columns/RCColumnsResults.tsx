import { type RCColumnResult } from '../../lib/calculations/rcColumns';
import { VerdictBadge, CheckRowItem, GroupHeader, overallStatus, ambientStyle, checkValueStr } from '../../components/checks';
import { resultLabel } from '../../lib/text/labels';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { formatQuantity } from '../../lib/units/format';
import type { Quantity } from '../../lib/units/types';
import type { UnitSystem } from '../../lib/units/types';

interface RCColumnsResultsProps {
  result: RCColumnResult;
}

/** Informational check row — dimmed '(info)' tag, no state color. */
function InfoCheckRow({ check, system }: { check: import('../../lib/calculations/types').CheckRow; system: UnitSystem }) {
  const util = check.utilization;
  const barPct = isFinite(util) && !isNaN(util) ? Math.min(util * 100, 100) : 0;
  const valueStr = isNaN(util) ? '—' : isFinite(util) ? `${(util * 100).toFixed(0)}%` : '—';

  return (
    <div className="grid grid-cols-[1fr_auto_44px_auto] items-center gap-2.5 py-1.75 border-b border-border-sub last:border-b-0" data-check-id={check.id}>
      <span className="text-[12px] text-text-disabled leading-snug">{check.description}</span>
      <span className="font-mono text-[11px] text-text-secondary text-right whitespace-nowrap tabular-nums">
        {checkValueStr(check, system)}
      </span>
      <div className="h-0.75 bg-border-main rounded-sm overflow-hidden">
        <div
          className="h-full rounded-sm bg-border-main"
          style={{ width: `${barPct}%`, opacity: 0.4 }}
          role="presentation"
        />
      </div>
      <span className="font-mono text-[10px] font-semibold px-1.25 py-0.5 rounded tracking-[0.02em] whitespace-nowrap text-text-disabled bg-bg-elevated">
        {valueStr}
      </span>
    </div>
  );
}

/** 3-column value row: label | y-value | z-value */
function BiaxValueRow({
  label,
  valueY,
  valueZ,
  hiddenY = false,
  hiddenZ = false,
}: {
  label: string;
  valueY: string;
  valueZ: string;
  hiddenY?: boolean;
  hiddenZ?: boolean;
}) {
  if (hiddenY && hiddenZ) return null;
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-1.75 border-b border-border-sub last:border-b-0">
      <span className="text-[12px] text-text-secondary">{label}</span>
      <span className={`font-mono text-[11px] tabular-nums w-16 text-right ${hiddenY ? 'text-text-disabled/40' : 'text-text-primary'}`}>
        {hiddenY ? '—' : valueY}
      </span>
      <span className={`font-mono text-[11px] tabular-nums w-16 text-right ${hiddenZ ? 'text-text-disabled/40' : 'text-text-secondary'}`}>
        {hiddenZ ? '—' : valueZ}
      </span>
    </div>
  );
}

/** Shared value row (single value, full width) */
function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.75 border-b border-border-sub last:border-b-0">
      <span className="text-[12px] text-text-secondary">{label}</span>
      <span className="text-[11px] font-mono text-text-primary tabular-nums">{value}</span>
    </div>
  );
}

export function RCColumnsResults({ result }: RCColumnsResultsProps) {
  const { system } = useUnitSystem();
  const fmtSi = (v: number, q: Quantity) => formatQuantity(v, q, system);
  if (!result.valid) {
    return (
      <div className="flex items-center justify-center h-24 rounded border border-state-fail/30 bg-state-fail/5">
        <p className="text-[12px] text-state-fail text-center px-3">{result.error ?? 'Datos inv\u00e1lidos'}</p>
      </div>
    );
  }

  if (result.sectionType === 'circular') {
    return <RCColumnsCircularResults result={result} system={system} />;
  }

  const status = overallStatus(result.checks);

  const slenderChecks  = result.checks.filter((c) => ['lambda-y', 'lambda-z', 'nd-max'].includes(c.id));
  const nmYCheck       = result.checks.find((c) => c.id === 'nm-y');
  const nmZCheck       = result.checks.find((c) => c.id === 'nm-z');
  const cond5a         = result.checks.find((c) => c.id === 'cond-5.38a');
  const cond5b         = result.checks.find((c) => c.id === 'cond-5.38b');
  const biaxialCheck   = result.checks.find((c) => c.id === 'biaxial-check');
  // `as-min-mech` FALTABA aquí (sí estaba en el panel circular): con 600×600,
  // 4Ø16 y N_Ed = 4000 kN es la ÚNICA comprobación que incumple (124%) → la
  // cabecera se ponía en INCUMPLE sin una sola fila roja. El PDF sí la pintaba.
  const longChecks     = result.checks.filter((c) => ['as-min', 'as-min-mech', 'as-max', 'nBars-min', 'bar-spacing-x', 'bar-spacing-y'].includes(c.id));
  const transChecks    = result.checks.filter((c) => ['stirrup-diam', 'stirrup-spacing'].includes(c.id));

  // Red de seguridad: lo que el motor añada y este panel no coloque, se pinta
  // igual al final. El veredicto se calcula sobre TODAS las filas, así que
  // ninguna puede quedarse fuera de la pantalla sin más.
  const placed = new Set([
    ...slenderChecks.map((c) => c.id), 'nm-y', 'nm-z', 'cond-5.38a', 'cond-5.38b', 'biaxial-check',
    ...longChecks.map((c) => c.id), ...transChecks.map((c) => c.id),
  ]);
  const unplaced = result.checks.filter((c) => !placed.has(c.id));

  const showE2y = result.lambda_y > 25;
  const showE2z = result.lambda_z > 25;

  return (
    <div
      className="rounded px-4 py-3 transition-colors"
      style={ambientStyle(status)}
      aria-label="Resultados pilares"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-border-main">
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">
          Resultados calculados
        </span>
        <VerdictBadge status={status} />
      </div>

      {/* Key values — 2-column paired (y / z) */}
      <GroupHeader label="Valores clave" />
      {/* axis sub-header */}
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-0.5">
        <span />
        <span className="font-mono text-[10px] text-text-disabled w-16 text-right">(y)</span>
        <span className="font-mono text-[10px] text-text-disabled w-16 text-right">(z)</span>
      </div>
      <BiaxValueRow
        label="d (canto útil)"
        valueY={`${result.d_y.toFixed(0)} mm`}
        valueZ={`${result.d_z.toFixed(0)} mm`}
      />
      <BiaxValueRow
        label="λ (esbeltez)"
        valueY={`${result.lambda_y.toFixed(1)}${result.lambda_y > 25 ? ' ★' : ''}`}
        valueZ={`${result.lambda_z.toFixed(1)}${result.lambda_z > 25 ? ' ★' : ''}`}
      />
      <BiaxValueRow label="e1"     valueY={`${result.e1_y.toFixed(1)} mm`}    valueZ={`${result.e1_z.toFixed(1)} mm`} />
      <BiaxValueRow label="e_imp"  valueY={`${result.e_imp_y.toFixed(1)} mm`} valueZ={`${result.e_imp_z.toFixed(1)} mm`} />
      <BiaxValueRow
        label="e2  (2º orden)"
        valueY={`${result.e2_y.toFixed(1)} mm`}
        valueZ={`${result.e2_z.toFixed(1)} mm`}
        hiddenY={!showE2y}
        hiddenZ={!showE2z}
      />
      <BiaxValueRow label="e_tot"   valueY={`${result.e_tot_y.toFixed(1)} mm`}  valueZ={`${result.e_tot_z.toFixed(1)} mm`} />
      <BiaxValueRow label="MEd,tot" valueY={fmtSi(result.MEd_tot_y, 'moment')} valueZ={fmtSi(result.MEd_tot_z, 'moment')} />

      {/* Shared values */}
      <div className="mt-1 pt-1 border-t border-border-sub">
        <ValueRow label="d' (arm. compresión)"         value={`${result.d_prime.toFixed(0)} mm`} />
        <ValueRow label={resultLabel('As_total')}      value={`${result.As_total.toFixed(0)} mm\u00b2`} />
        <ValueRow label={resultLabel('NRd_max')}       value={fmtSi(result.NRd_max, 'force')} />
        <ValueRow label="MRdy / MRdz"                   value={`${fmtSi(result.MRdy, 'moment')} / ${fmtSi(result.MRdz, 'moment')}`} />
        <ValueRow label={`ned \u2192 a  (${result.ned.toFixed(3)} \u2192 ${result.a.toFixed(2)})`} value="" />
      </div>

      {/* ELU Flexión Esviada */}
      <GroupHeader label="ELU Flexión Esviada" />
      {biaxialCheck && <CheckRowItem check={biaxialCheck} />}
      {nmYCheck    && <InfoCheckRow  check={nmYCheck}  system={system} />}
      {nmZCheck    && <InfoCheckRow  check={nmZCheck}  system={system} />}
      {cond5a      && <InfoCheckRow  check={cond5a}    system={system} />}
      {cond5b      && <InfoCheckRow  check={cond5b}    system={system} />}

      {/* Pandeo */}
      <GroupHeader label="Pandeo y segundo orden" />
      {slenderChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {/* Armadura longitudinal */}
      <GroupHeader label="Armadura longitudinal" />
      {longChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {/* Armadura transversal */}
      <GroupHeader label="Armadura transversal" />
      {transChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {/* Cualquier comprobación futura no colocada arriba: nunca invisible. */}
      {unplaced.length > 0 && <GroupHeader label="Otras comprobaciones" />}
      {unplaced.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {/* Rebar footer */}
      <div className="mt-3 pt-2 border-t border-border-sub space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-disabled">Despiece</span>
          <span className="font-mono text-[11px] text-text-primary">{result.rebarSchedule}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-disabled">Solape mín. (CE Anejo 19 §8.7.3)</span>
          <span className="font-mono text-[11px] text-text-primary">{result.lapLength} mm</span>
        </div>
      </div>
    </div>
  );
}

// ── Circular section results — single-column layout (no biaxial split) ───────
function RCColumnsCircularResults({ result, system }: { result: RCColumnResult; system: UnitSystem }) {
  const fmtSi = (v: number, q: Quantity) => formatQuantity(v, q, system);
  const status = overallStatus(result.checks);
  const find = (id: string) => result.checks.find((c) => c.id === id);

  const flexionCheck = find('flexion-check');
  const nmResCheck = find('nm-res');
  const slenderChecks = result.checks.filter((c) => ['lambda', 'nd-max'].includes(c.id));
  const longChecks = result.checks.filter((c) =>
    ['as-min', 'as-min-mech', 'as-max', 'nBars-min', 'bar-spacing-circ'].includes(c.id));
  const transChecks = result.checks.filter((c) => ['stirrup-diam', 'stirrup-spacing'].includes(c.id));

  // Red de seguridad — ver el gemelo rectangular.
  const placed = new Set([
    'flexion-check', 'nm-res',
    ...slenderChecks.map((c) => c.id), ...longChecks.map((c) => c.id), ...transChecks.map((c) => c.id),
  ]);
  const unplaced = result.checks.filter((c) => !placed.has(c.id));

  // Mostrar la fila e2 cuando el 2º orden se ha aplicado realmente (e2 > 0), no
  // por λ > 25: λ_lim puede caer por debajo de 25 con axil alto, de modo que e2
  // ya está incluido en e_tot/M_res aunque λ ≤ 25.
  const showE2 = result.e2_y > 0;

  return (
    <div className="rounded px-4 py-3 transition-colors" style={ambientStyle(status)} aria-label="Resultados pilar circular">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-border-main">
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">
          Resultados calculados — circular
        </span>
        <VerdictBadge status={status} />
      </div>

      {/* Key values — single column */}
      <GroupHeader label="Valores clave" />
      <ValueRow label="D (diámetro)"            value={`${(result.D ?? 0).toFixed(0)} mm`} />
      <ValueRow label="λ (esbeltez)"            value={`${(result.lambda ?? 0).toFixed(1)}${(result.lambda ?? 0) > 25 ? ' ★' : ''}`} />
      <ValueRow label="d (canto útil)"          value={`${(result.d_circ ?? 0).toFixed(0)} mm`} />
      <ValueRow label="e1"                       value={`${result.e1_y.toFixed(1)} mm`} />
      <ValueRow label="e_imp"                    value={`${result.e_imp_y.toFixed(1)} mm`} />
      {showE2 && <ValueRow label="e2  (2º orden)" value={`${result.e2_y.toFixed(1)} mm`} />}
      <ValueRow label="e_tot"                    value={`${(result.e_tot_res ?? 0).toFixed(1)} mm`} />
      <ValueRow label="M_res (resultante)"       value={fmtSi(result.M_res ?? 0, 'moment')} />
      <ValueRow label={resultLabel('As_total')}  value={`${result.As_total.toFixed(0)} mm²`} />
      <ValueRow label={resultLabel('NRd_max')}   value={fmtSi(result.NRd_max, 'force')} />
      <ValueRow label="MRd"                       value={fmtSi(result.MRd ?? 0, 'moment')} />
      <ValueRow label={`ned (${result.ned.toFixed(3)})`} value="" />

      {/* Flexocompresión */}
      <GroupHeader label="Flexocompresión" />
      {flexionCheck && <CheckRowItem check={flexionCheck} />}
      {nmResCheck && <InfoCheckRow check={nmResCheck} system={system} />}

      {/* Pandeo */}
      <GroupHeader label="Pandeo y segundo orden" />
      {slenderChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {/* Armadura longitudinal */}
      <GroupHeader label="Armadura longitudinal" />
      {longChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {/* Armadura transversal */}
      <GroupHeader label="Armadura transversal" />
      {transChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {/* Cualquier comprobación futura no colocada arriba: nunca invisible. */}
      {unplaced.length > 0 && <GroupHeader label="Otras comprobaciones" />}
      {unplaced.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {/* Rebar footer */}
      <div className="mt-3 pt-2 border-t border-border-sub space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-disabled">Despiece</span>
          <span className="font-mono text-[11px] text-text-primary">{result.rebarSchedule}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-disabled">Solape mín. (CE Anejo 19 §8.7.3)</span>
          <span className="font-mono text-[11px] text-text-primary">{result.lapLength} mm</span>
        </div>
      </div>
    </div>
  );
}
