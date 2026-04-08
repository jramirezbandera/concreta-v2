import { AlertTriangle } from 'lucide-react';
import { type EmpresalladoResult } from '../../lib/calculations/empresillado';
import { type CheckStatus } from '../../lib/calculations/types';

interface EmpresalladoResultsProps {
  result: EmpresalladoResult;
}

type DisplayStatus = CheckStatus;

function overallStatus(result: EmpresalladoResult): DisplayStatus {
  const fails = result.checks.filter((c) => c.status === 'fail');
  const warns = result.checks.filter((c) => c.status === 'warn');
  if (fails.length > 0) return 'fail';
  if (warns.length > 0) return 'warn';
  return 'ok';
}

const STATUS_LABEL: Record<DisplayStatus, string> = {
  ok: 'CUMPLE',
  warn: 'ADVERT.',
  fail: 'INCUMPLE',
};

const STATUS_TAG_CLASSES: Record<DisplayStatus, string> = {
  ok: 'bg-state-ok/10 text-state-ok',
  warn: 'bg-state-warn/10 text-state-warn',
  fail: 'bg-state-fail/10 text-state-fail',
};

const BAR_CLASSES: Record<DisplayStatus, string> = {
  ok: 'bg-state-ok',
  warn: 'bg-state-warn',
  fail: 'bg-state-fail',
};

function VerdictBadge({ status }: { status: DisplayStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold px-1.25 py-0.5 rounded tracking-[0.02em] ${STATUS_TAG_CLASSES[status]}`}
      role="status"
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function CheckRowItem({ id, description, value, limit, utilization, status }: {
  id: string; description: string; value: string; limit: string; utilization: number; status: DisplayStatus;
}) {
  const pct = Math.min(utilization * 100, 100);
  return (
    <div
      className="grid items-center gap-3 py-1.75 border-b border-border-sub last:border-b-0"
      style={{ gridTemplateColumns: '1fr auto 112px auto' }}
      data-check-id={id}
    >
      <span className="text-[12px] text-text-secondary leading-snug">{description}</span>
      <div className="flex flex-col items-end gap-0 shrink-0">
        <span className="font-mono text-[11px] text-text-primary tabular-nums whitespace-nowrap">{value}</span>
        <span className="font-mono text-[10px] text-text-disabled tabular-nums whitespace-nowrap">{limit}</span>
      </div>
      <div className="h-1 bg-border-main rounded-sm overflow-hidden">
        <div className={`h-full rounded-sm ${BAR_CLASSES[status]}`} style={{ width: `${pct}%` }} role="presentation" />
      </div>
      <span className={`font-mono text-[10px] font-semibold px-1.25 py-0.5 rounded tracking-[0.02em] whitespace-nowrap ${STATUS_TAG_CLASSES[status]}`}>
        {utilization <= 1 ? `${(utilization * 100).toFixed(0)}%` : STATUS_LABEL[status]}
      </span>
    </div>
  );
}

function GroupHeader({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-disabled pt-2.25 pb-1.75 border-b border-border-sub mb-1">
      {label}
    </p>
  );
}

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.75 border-b border-border-sub last:border-b-0">
      <span className="text-[12px] text-text-secondary">{label}</span>
      <span className="text-[11px] font-mono text-text-primary tabular-nums">{value}</span>
    </div>
  );
}

export function EmpresalladoResults({ result }: EmpresalladoResultsProps) {
  if (!result.valid) {
    return (
      <div className="flex items-start gap-3 rounded border border-state-fail/30 bg-state-fail/5 px-3 py-3">
        <AlertTriangle size={16} className="text-state-fail mt-0.5 shrink-0" />
        <p className="text-[12px] text-state-fail">{result.error ?? 'Datos inválidos'}</p>
      </div>
    );
  }

  const status = overallStatus(result);

  const chordCheck   = result.checks.find((c) => c.id === 'cordones');
  const localCheck   = result.checks.find((c) => c.id === 'pandeo-local');
  const globalCheck  = result.checks.find((c) => c.id === 'pandeo-global');
  const pletMCheck   = result.checks.find((c) => c.id === 'pletina-flexion');
  const pletVCheck   = result.checks.find((c) => c.id === 'pletina-cortante');

  return (
    <div className="flex flex-col" aria-label="Resultados">

      {/* Verdict header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-border-main">
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">
          Resultados calculados
        </span>
        <VerdictBadge status={status} />
      </div>

      {/* Geometry */}
      <GroupHeader label="Geometría" />
      <ValueRow label="dx / dy" value={`${result.dx.toFixed(2)} / ${result.dy.toFixed(2)} cm`} />
      <ValueRow label="hx / hy" value={`${result.hx.toFixed(2)} / ${result.hy.toFixed(2)} cm`} />
      <ValueRow label="I_X / I_Y" value={`${result.I_X.toFixed(0)} / ${result.I_Y.toFixed(0)} cm⁴`} />
      <ValueRow label="i_X / i_Y" value={`${result.i_X.toFixed(3)} / ${result.i_Y.toFixed(3)} cm`} />

      {/* Chord compression */}
      <GroupHeader label="Cordones" />
      <ValueRow label="N_chord,Ed" value={`${result.N_chord_max.toFixed(1)} kN`} />
      {chordCheck && <CheckRowItem {...chordCheck} status={chordCheck.status} />}

      {/* Local buckling */}
      <GroupHeader label="Pandeo local (eje v)" />
      <ValueRow label="λ̄_v" value={result.lambda_v.toFixed(3)} />
      <ValueRow label="χ_v" value={result.chi_v.toFixed(3)} />
      {localCheck && <CheckRowItem {...localCheck} status={localCheck.status} />}

      {/* Global buckling */}
      <GroupHeader label="Pandeo global (EC3 §6.4)" />
      <ValueRow label="λ̄_0 (X / Y)" value={`${result.lambda_0X.toFixed(3)} / ${result.lambda_0Y.toFixed(3)}`} />
      <ValueRow label="λ̄_eff (X / Y)" value={`${result.lambda_effX.toFixed(3)} / ${result.lambda_effY.toFixed(3)}`} />
      <ValueRow label="χ (X / Y)" value={`${result.chi_X.toFixed(3)} / ${result.chi_Y.toFixed(3)}`} />
      <ValueRow label="χ (eje desfavorable)" value={result.chi.toFixed(3)} />
      {globalCheck && <CheckRowItem {...globalCheck} status={globalCheck.status} />}

      {/* Pletinas */}
      <GroupHeader label="Pletinas" />
      <ValueRow label="V_Ed" value={`${result.V_Ed.toFixed(2)} kN`} />
      <ValueRow label="M_Ed,pl" value={`${result.M_Ed_pl.toFixed(3)} kNm`} />
      {pletMCheck && <CheckRowItem {...pletMCheck} status={pletMCheck.status} />}
      {pletVCheck && <CheckRowItem {...pletVCheck} status={pletVCheck.status} />}
    </div>
  );
}
