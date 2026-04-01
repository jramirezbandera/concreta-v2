// Shared result display primitives for RC calculation modules.
// These components are typed to CheckStatus / CheckRow from src/lib/calculations/types.ts.
// Steel modules use different types (SteelCheckStatus, SteelCheckRow) and are not covered here.

import { type CheckRow, type CheckStatus } from '../../lib/calculations/types';

export const STATUS_LABEL: Record<CheckStatus, string> = {
  ok:   'CUMPLE',
  warn: 'ADVERT.',
  fail: 'INCUMPLE',
};

const STATUS_TAG_CLASSES: Record<CheckStatus, string> = {
  ok:   'bg-state-ok/10 text-state-ok',
  warn: 'bg-state-warn/10 text-state-warn',
  fail: 'bg-state-fail/10 text-state-fail',
};

const BAR_CLASSES: Record<CheckStatus, string> = {
  ok:   'bg-state-ok',
  warn: 'bg-state-warn',
  fail: 'bg-state-fail',
};

export const BORDER_CLASSES: Record<CheckStatus, string> = {
  ok:   'border-state-ok/40',
  warn: 'border-state-warn/40',
  fail: 'border-state-fail/40',
};

export function overallStatus(checks: CheckRow[]): CheckStatus {
  if (checks.some((c) => c.status === 'fail')) return 'fail';
  if (checks.some((c) => c.status === 'warn')) return 'warn';
  return 'ok';
}

export function VerdictBadge({ status }: { status: CheckStatus }) {
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

export function CheckRowItem({ check }: { check: CheckRow }) {
  const pct = isFinite(check.utilization) ? Math.min(check.utilization * 100, 100) : 100;
  return (
    <div className="grid grid-cols-[1fr_auto_44px_auto] items-center gap-2.5 py-1.75 border-b border-border-sub last:border-b-0">
      <span className="text-[12px] text-text-secondary leading-snug">{check.description}</span>
      <span className="text-right">
        <span className="block font-mono text-[11px] text-text-primary whitespace-nowrap tabular-nums">
          {check.value}
        </span>
        {check.limit && (
          <span className="block font-mono text-[10px] text-text-disabled whitespace-nowrap tabular-nums">
            {check.limit}
          </span>
        )}
      </span>
      <div className="h-0.75 bg-border-main rounded-sm overflow-hidden">
        <div
          className={`h-full rounded-sm ${BAR_CLASSES[check.status]}`}
          style={{ width: `${pct}%` }}
          role="presentation"
        />
      </div>
      <span className={`font-mono text-[10px] font-semibold px-1.25 py-0.5 rounded tracking-[0.02em] whitespace-nowrap ${STATUS_TAG_CLASSES[check.status]}`}>
        {isFinite(check.utilization) && check.utilization <= 1
          ? `${(check.utilization * 100).toFixed(0)}%`
          : STATUS_LABEL[check.status]}
      </span>
    </div>
  );
}

export function GroupHeader({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-disabled pt-2.25 pb-1.75 border-b border-border-sub mb-1">
      {label}
    </p>
  );
}

export function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.75 border-b border-border-sub last:border-b-0">
      <span className="text-[12px] text-text-secondary">{label}</span>
      <span className="text-[11px] font-mono text-text-primary tabular-nums">{value}</span>
    </div>
  );
}
