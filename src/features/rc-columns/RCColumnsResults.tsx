import { type RCColumnResult } from '../../lib/calculations/rcColumns';
import { VerdictBadge, CheckRowItem, GroupHeader, overallStatus, ambientStyle } from '../../components/checks';
import { resultLabel } from '../../lib/text/labels';

interface RCColumnsResultsProps {
  result: RCColumnResult;
}

/** Informational check row — dimmed '(info)' tag, no state color. */
function InfoCheckRow({ check }: { check: import('../../lib/calculations/types').CheckRow }) {
  const util = check.utilization;
  const barPct = isFinite(util) && !isNaN(util) ? Math.min(util * 100, 100) : 0;
  const valueStr = isNaN(util) ? '—' : isFinite(util) ? `${(util * 100).toFixed(0)}%` : '—';

  return (
    <div className="grid grid-cols-[1fr_auto_44px_auto] items-center gap-2.5 py-1.75 border-b border-border-sub last:border-b-0">
      <span className="text-[12px] text-text-disabled leading-snug">{check.description}</span>
      <span className="font-mono text-[11px] text-text-secondary text-right whitespace-nowrap tabular-nums">
        {check.value}
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
  if (!result.valid) {
    return (
      <div className="flex items-center justify-center h-24 rounded border border-state-fail/30 bg-state-fail/5">
        <p className="text-[12px] text-state-fail text-center px-3">{result.error ?? 'Datos inv\u00e1lidos'}</p>
      </div>
    );
  }

  const status = overallStatus(result.checks);

  const slenderChecks  = result.checks.filter((c) => ['lambda-y', 'lambda-z', 'nd-max'].includes(c.id));
  const nmYCheck       = result.checks.find((c) => c.id === 'nm-y');
  const nmZCheck       = result.checks.find((c) => c.id === 'nm-z');
  const cond5a         = result.checks.find((c) => c.id === 'cond-5.38a');
  const cond5b         = result.checks.find((c) => c.id === 'cond-5.38b');
  const biaxialCheck   = result.checks.find((c) => c.id === 'biaxial-check');
  const longChecks     = result.checks.filter((c) => ['as-min', 'as-max', 'nBars-min', 'bar-spacing-x', 'bar-spacing-y'].includes(c.id));
  const transChecks    = result.checks.filter((c) => ['stirrup-diam', 'stirrup-spacing'].includes(c.id));

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
        <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-text-secondary">
          Pilar — Flexión Esviada
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
      <BiaxValueRow label="MEd,tot" valueY={`${result.MEd_tot_y.toFixed(1)} kNm`} valueZ={`${result.MEd_tot_z.toFixed(1)} kNm`} />

      {/* Shared values */}
      <div className="mt-1 pt-1 border-t border-border-sub">
        <ValueRow label="d' (arm. compresión)"         value={`${result.d_prime.toFixed(0)} mm`} />
        <ValueRow label={resultLabel('As_total')}      value={`${result.As_total.toFixed(0)} mm\u00b2`} />
        <ValueRow label={resultLabel('NRd_max')}       value={`${result.NRd_max.toFixed(0)} kN`} />
        <ValueRow label="MRdy / MRdz"                   value={`${result.MRdy.toFixed(1)} / ${result.MRdz.toFixed(1)} kNm`} />
        <ValueRow label={`ned \u2192 a  (${result.ned.toFixed(3)} \u2192 ${result.a.toFixed(2)})`} value="" />
      </div>

      {/* ELU Flexión Esviada */}
      <GroupHeader label="ELU Flexión Esviada" />
      {biaxialCheck && <CheckRowItem check={biaxialCheck} />}
      {nmYCheck    && <InfoCheckRow  check={nmYCheck} />}
      {nmZCheck    && <InfoCheckRow  check={nmZCheck} />}
      {cond5a      && <InfoCheckRow  check={cond5a} />}
      {cond5b      && <InfoCheckRow  check={cond5b} />}

      {/* Pandeo */}
      <GroupHeader label="Pandeo y segundo orden" />
      {slenderChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {/* Armadura longitudinal */}
      <GroupHeader label="Armadura longitudinal" />
      {longChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {/* Armadura transversal */}
      <GroupHeader label="Armadura transversal" />
      {transChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {/* Rebar footer */}
      <div className="mt-3 pt-2 border-t border-border-sub space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-disabled">Despiece</span>
          <span className="font-mono text-[11px] text-text-primary">{result.rebarSchedule}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-disabled">Solape mín. (CE art. 69.5.2)</span>
          <span className="font-mono text-[11px] text-text-primary">{result.lapLength} mm</span>
        </div>
      </div>
    </div>
  );
}
