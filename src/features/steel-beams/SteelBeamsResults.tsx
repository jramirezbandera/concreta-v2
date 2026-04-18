import { AlertTriangle } from 'lucide-react';
import { type SteelBeamResult, type SteelCheckRow, type SteelCheckStatus } from '../../lib/calculations/steelBeams';
import { LABELS, resultLabel } from '../../lib/text/labels';
import { ambientStyle } from '../../components/checks';

interface SteelBeamsResultsProps {
  result: SteelBeamResult;
  deflLimit: number;
}

type DisplayStatus = Exclude<SteelCheckStatus, 'neutral'>;

function overallStatus(checks: SteelCheckRow[]): DisplayStatus {
  const active = checks.filter((c) => !c.neutral);
  if (active.some((c) => c.status === 'fail')) return 'fail';
  if (active.some((c) => c.status === 'warn')) return 'warn';
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

function NeutralCheckRow({ check }: { check: SteelCheckRow }) {
  return (
    <div className="flex items-center justify-between py-1.75 border-b border-border-sub last:border-b-0">
      <span className="text-[12px] text-text-secondary leading-snug">{check.description}</span>
      <span
        className="font-mono text-[10px] font-semibold px-1.25 py-0.5 rounded tracking-[0.02em] whitespace-nowrap bg-state-neutral/10 text-state-neutral"
      >
        {check.tag ?? '—'}
      </span>
    </div>
  );
}

function ActiveCheckRow({ check }: { check: SteelCheckRow }) {
  const status = check.status as DisplayStatus;
  const pct = Math.min(check.utilization * 100, 100);
  return (
    <div className="grid grid-cols-[1fr_auto_w-28_auto] items-center gap-3 py-1.75 border-b border-border-sub last:border-b-0"
      style={{ gridTemplateColumns: '1fr auto 112px auto' }}>
      <span className="text-[12px] text-text-secondary leading-snug">{check.description}</span>
      <div className="flex flex-col items-end gap-0 shrink-0">
        <span className="font-mono text-[11px] text-text-primary tabular-nums whitespace-nowrap">
          {check.value}
        </span>
        <span className="font-mono text-[10px] text-text-disabled tabular-nums whitespace-nowrap">
          {check.limit}
        </span>
      </div>
      <div className="h-1 bg-border-main rounded-sm overflow-hidden">
        <div
          className={`h-full rounded-sm ${BAR_CLASSES[status]}`}
          style={{ width: `${pct}%` }}
          role="presentation"
        />
      </div>
      <span
        className={`font-mono text-[10px] font-semibold px-1.25 py-0.5 rounded tracking-[0.02em] whitespace-nowrap ${STATUS_TAG_CLASSES[status]}`}
      >
        {check.utilization <= 1
          ? `${(check.utilization * 100).toFixed(0)}%`
          : STATUS_LABEL[status]}
      </span>
    </div>
  );
}

function CheckRowItem({ check }: { check: SteelCheckRow }) {
  if (check.neutral) return <NeutralCheckRow check={check} />;
  return <ActiveCheckRow check={check} />;
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

export function SteelBeamsResults({ result, deflLimit }: SteelBeamsResultsProps) {
  // Class 4 or unknown profile error
  if (!result.valid && result.governing === 'class4') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3 rounded border border-state-fail/30 bg-state-fail/5 px-3 py-3">
          <AlertTriangle size={16} className="text-state-fail mt-0.5 shrink-0" />
          <div>
            <p className="text-[12px] text-state-fail font-semibold mb-0.5">Sección clase 4</p>
            <p className="text-[11px] text-text-secondary">
              Las secciones clase 4 (esbeltez elevada) no están implementadas en v1. Elija un perfil más robusto.
            </p>
          </div>
        </div>
        {/* Still show classification row */}
        {result.checks.length > 0 && (
          <div>
            {result.checks.map((c) => <CheckRowItem key={c.id} check={c} />)}
          </div>
        )}
      </div>
    );
  }

  // Generic error (unknown profile, etc.)
  if (!result.valid) {
    return (
      <div className="flex items-center justify-center h-24 rounded border border-state-fail/30 bg-state-fail/5">
        <p className="text-[12px] text-state-fail text-center px-3">{result.error ?? 'Datos inválidos'}</p>
      </div>
    );
  }

  const status = overallStatus(result.checks);

  const sectionChecks   = result.checks.filter((c) => c.id === 'classification');
  const bendingChecks   = result.checks.filter((c) => c.id === 'bending');
  const shearChecks     = result.checks.filter((c) => ['shear', 'interaction'].includes(c.id));
  const ltbChecks       = result.checks.filter((c) => c.id === 'ltb');
  const deflChecks      = result.checks.filter((c) => c.id === 'deflection');

  return (
    <div className="flex flex-col" aria-label="Resultados" style={ambientStyle(status)}>

      {/* Verdict header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-border-main">
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">
          Resultados calculados
        </span>
        <VerdictBadge status={status} />
      </div>

      {/* Key values */}
      <GroupHeader label="Valores" />
      <ValueRow label={resultLabel('Mc_Rd')}        value={`${result.Mc_Rd.toFixed(1)} kNm`} />
      <ValueRow label={resultLabel('Vc_Rd')}        value={`${result.Vc_Rd.toFixed(1)} kN`} />
      <ValueRow label={resultLabel('Mb_Rd')}        value={`${result.Mb_Rd.toFixed(1)} kNm`} />
      <ValueRow label={resultLabel('chi_LT')}       value={result.chi_LT.toFixed(3)} />
      <ValueRow label={resultLabel('lambda_bar_LT')} value={result.lambda_LT.toFixed(3)} />
      <ValueRow label={resultLabel('delta_max')}    value={`${result.delta_max.toFixed(1)} mm`} />
      <ValueRow label={`${LABELS.delta_adm.sym} — admisible (L/${deflLimit})`} value={`${result.delta_adm.toFixed(1)} mm`} />

      {/* Section classification */}
      <GroupHeader label="Sección" />
      {sectionChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {/* ELU Flexión */}
      <GroupHeader label="ELU Flexión" />
      {bendingChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {/* ELU Cortante + Interacción */}
      <GroupHeader label="ELU Cortante" />
      {shearChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {/* Pandeo lateral */}
      <GroupHeader label="Pandeo lateral (LTB)" />
      {ltbChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {/* ELS Flecha */}
      <GroupHeader label="ELS Flecha" />
      {deflChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}
    </div>
  );
}
