import { type RCBeamResult, type CheckRow, type CheckStatus } from '../../lib/calculations/rcBeams';

interface RCBeamsResultsProps {
  result: RCBeamResult;
}

function overallStatus(checks: CheckRow[]): CheckStatus {
  if (checks.some((c) => c.status === 'fail')) return 'fail';
  if (checks.some((c) => c.status === 'warn')) return 'warn';
  return 'ok';
}

const STATUS_LABEL: Record<CheckStatus, string> = {
  ok: 'CUMPLE',
  warn: 'ADVERT.',
  fail: 'INCUMPLE',
};

const STATUS_TAG_CLASSES: Record<CheckStatus, string> = {
  ok: 'bg-state-ok/10 text-state-ok',
  warn: 'bg-state-warn/10 text-state-warn',
  fail: 'bg-state-fail/10 text-state-fail',
};

const BAR_CLASSES: Record<CheckStatus, string> = {
  ok: 'bg-state-ok',
  warn: 'bg-state-warn',
  fail: 'bg-state-fail',
};

function VerdictBadge({ status }: { status: CheckStatus }) {
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

function CheckRowItem({ check }: { check: CheckRow }) {
  const pct = Math.min(check.utilization * 100, 100);
  return (
    <div className="grid grid-cols-[1fr_auto_44px_auto] items-center gap-2.5 py-1.75 border-b border-border-sub last:border-b-0">
      <span className="text-[12px] text-text-secondary leading-snug">{check.description}</span>
      <span className="font-mono text-[11px] text-text-primary text-right whitespace-nowrap tabular-nums">
        {check.value}
      </span>
      <div className="h-0.75 bg-border-main rounded-sm overflow-hidden">
        <div
          className={`h-full rounded-sm ${BAR_CLASSES[check.status]}`}
          style={{ width: `${pct}%` }}
          role="presentation"
        />
      </div>
      <span className={`font-mono text-[10px] font-semibold px-1.25 py-0.5 rounded tracking-[0.02em] whitespace-nowrap ${STATUS_TAG_CLASSES[check.status]}`}>
        {check.utilization <= 1 ? `${(check.utilization * 100).toFixed(0)}%` : STATUS_LABEL[check.status]}
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

export function RCBeamsResults({ result }: RCBeamsResultsProps) {
  if (!result.valid) {
    return (
      <div className="flex items-center justify-center h-24 rounded border border-state-fail/30 bg-state-fail/5">
        <p className="text-[12px] text-state-fail text-center px-3">{result.error ?? 'Datos inválidos'}</p>
      </div>
    );
  }

  const status = overallStatus(result.checks);
  const bendingChecks = result.checks.filter((c) => ['bending', 'as-min', 'as-max'].includes(c.id));
  const shearChecks = result.checks.filter((c) => ['shear', 'shear-max'].includes(c.id));
  const crackingChecks = result.checks.filter((c) => c.id === 'cracking');

  return (
    <div className="flex flex-col" aria-label="Resultados">
      {/* Verdict header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-border-main">
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">
          Resultados calculados
        </span>
        <VerdictBadge status={status} />
      </div>

      {/* Key values */}
      <GroupHeader label="Valores" />
      <ValueRow label="d (canto útil)" value={`${result.d.toFixed(0)} mm`} />
      <ValueRow label="As (armadura)" value={`${result.As.toFixed(0)} mm²`} />
      <ValueRow label="x (eje neutro)" value={`${result.x.toFixed(0)} mm`} />
      <ValueRow label="MRd" value={`${result.MRd.toFixed(1)} kNm`} />
      <ValueRow label="VRd" value={`${result.VRd.toFixed(1)} kN`} />
      <ValueRow label="wk" value={`${result.wk.toFixed(3)} mm`} />

      <GroupHeader label="ELU Flexión" />
      {bendingChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      <GroupHeader label="ELU Cortante" />
      {shearChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      <GroupHeader label="ELS Fisuración" />
      {crackingChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}
    </div>
  );
}
