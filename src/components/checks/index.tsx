// Shared result display primitives for calculation modules.
// These components are typed to CheckStatus / CheckRow from src/lib/calculations/types.ts.

import { type CheckRow, type CheckStatus } from '../../lib/calculations/types';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { formatQuantity } from '../../lib/units/format';
import type { UnitSystem } from '../../lib/units/types';

export const STATUS_LABEL: Record<CheckStatus, string> = {
  ok:      'CUMPLE',
  warn:    'ADVERT.',
  fail:    'INCUMPLE',
  neutral: '—',
};

const STATUS_TAG_CLASSES: Record<CheckStatus, string> = {
  ok:      'bg-state-ok/10 text-state-ok',
  warn:    'bg-state-warn/10 text-state-warn',
  fail:    'bg-state-fail/10 text-state-fail',
  neutral: 'bg-state-neutral/10 text-state-neutral',
};

const BAR_CLASSES: Record<CheckStatus, string> = {
  ok:      'bg-state-ok',
  warn:    'bg-state-warn',
  fail:    'bg-state-fail',
  neutral: 'bg-state-neutral',
};

export const BORDER_CLASSES: Record<CheckStatus, string> = {
  ok:      'border-state-ok/40',
  warn:    'border-state-warn/40',
  fail:    'border-state-fail/40',
  neutral: 'border-state-neutral/40',
};

export const STATUS_COLORS: Record<CheckStatus, { fg: string; bg: string; border: string }> = {
  ok:      { fg: '#22c55e', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.3)' },
  warn:    { fg: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)' },
  fail:    { fg: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.3)' },
  neutral: { fg: '#64748b', bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.3)' },
};

/**
 * Resolve a CheckRow's display value — prefers the numeric path (valueNum +
 * valueQty) for system-aware formatting, falling back to the legacy
 * `value`/`limit` strings. Pass `system` from the active unit system; callers
 * in a non-React context (PDF export) can pass 'si' until migrated.
 */
export function checkValueStr(c: CheckRow, system: UnitSystem = 'si'): string {
  if (c.valueNum !== undefined && c.valueQty) {
    return formatQuantity(c.valueNum, c.valueQty, system);
  }
  return c.valueStr ?? c.value ?? '';
}

export function checkLimitStr(c: CheckRow, system: UnitSystem = 'si'): string {
  if (c.limitNum !== undefined && c.limitQty) {
    return formatQuantity(c.limitNum, c.limitQty, system);
  }
  return c.limitStr ?? c.limit ?? '';
}

/** Ambient verdict style — gradient from status color fading down + 2px top border. */
export function ambientStyle(status: CheckStatus): React.CSSProperties {
  const c = STATUS_COLORS[status];
  return {
    background: `linear-gradient(180deg, ${c.bg} 0%, transparent 80px)`,
    borderTop: `2px solid ${c.fg}`,
  };
}

export function overallStatus(checks: CheckRow[]): Exclude<CheckStatus, 'neutral'> {
  const active = checks.filter((c) => c.status !== 'neutral');
  if (active.some((c) => c.status === 'fail')) return 'fail';
  if (active.some((c) => c.status === 'warn')) return 'warn';
  return 'ok';
}

export function VerdictBadge({ status }: { status: CheckStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold px-1.75 py-0.5 rounded tracking-[0.05em] ${STATUS_TAG_CLASSES[status]}`}
      role="status"
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function CheckRowItem({ check, compact = false }: { check: CheckRow; compact?: boolean }) {
  const { system } = useUnitSystem();
  const pct = isFinite(check.utilization) ? Math.min(check.utilization * 100, 100) : 100;
  const valueText = checkValueStr(check, system);
  const limitText = checkLimitStr(check, system);

  // Neutral row — informational (classification, etc.) with no utilization bar.
  if (check.status === 'neutral' || check.neutral) {
    return (
      <div className={`check-row relative grid items-center gap-3.5 py-2.5 ${compact ? 'px-3 pl-4' : 'px-4 pl-5'} border-b border-border-sub last:border-b-0`}
        style={{ gridTemplateColumns: '1fr auto 60px' }}
      >
        <span className="check-left-rail" />
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[12px] text-text-primary overflow-hidden text-ellipsis whitespace-nowrap">{check.description}</span>
          {check.article && (
            <span className="font-mono text-[10px] text-text-disabled">{check.article}</span>
          )}
        </div>
        <span />
        <span className={`font-mono text-[10px] font-semibold px-1.75 py-0.5 rounded tracking-[0.03em] whitespace-nowrap text-center ${STATUS_TAG_CLASSES.neutral}`}>
          {check.tag ?? valueText ?? '—'}
        </span>
      </div>
    );
  }

  // Compact mode (FEM embed): drops the horizontal utilization bar column to
  // fit the narrower right-side panel. Layout collapses from 4 cols to 3.
  const gridCols = compact ? '1fr auto auto' : '1fr 140px 64px 60px';
  const padX = compact ? 'px-3 pl-4' : 'px-4 pl-5';
  const gap  = compact ? 'gap-2' : 'gap-3.5';

  // In compact mode the description is allowed to wrap onto multiple lines
  // (the right panel is too narrow for a single-line ellipsis to be readable
  //  — "M…" or "Ar…" vanishes the meaning entirely).
  const descClass = compact
    ? 'text-[12px] text-text-primary leading-snug wrap-break-word'
    : 'text-[12px] text-text-primary overflow-hidden text-ellipsis whitespace-nowrap';

  return (
    <div className={`check-row relative grid items-start ${gap} py-2.5 ${padX} border-b border-border-sub last:border-b-0 cursor-pointer`}
      style={{ gridTemplateColumns: gridCols }}
    >
      <span className="check-left-rail" />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className={descClass}>{check.description}</span>
        {check.article && (
          <span className="font-mono text-[10px] text-text-disabled leading-snug">{check.article}</span>
        )}
      </div>
      <span className="text-right min-w-0 self-center">
        <span className="block font-mono text-[11px] text-text-secondary whitespace-nowrap tabular-nums">
          {valueText}
        </span>
        {limitText && (
          <span className="block font-mono text-[10px] text-text-disabled whitespace-nowrap tabular-nums">
            {limitText}
          </span>
        )}
      </span>
      {!compact && (
        <div className="h-1 bg-border-sub rounded-sm overflow-hidden self-center">
          <div
            className={`h-full rounded-sm transition-[width] duration-200 ${BAR_CLASSES[check.status]}`}
            style={{ width: `${pct}%` }}
            role="presentation"
          />
        </div>
      )}
      <span className={`font-mono text-[10px] font-semibold px-1.75 py-0.5 rounded tracking-[0.03em] whitespace-nowrap text-center self-center ${STATUS_TAG_CLASSES[check.status]}`}>
        {isFinite(check.utilization) && check.utilization <= 1
          ? `${(check.utilization * 100).toFixed(0)}%`
          : STATUS_LABEL[check.status]}
      </span>
    </div>
  );
}

export function GroupHeader({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-text-disabled pt-3.5 pb-2 px-4 border-b border-border-sub">
      {label}
    </p>
  );
}

export function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.75 px-4 border-b border-border-sub last:border-b-0">
      <span className="text-[12px] text-text-secondary">{label}</span>
      <span className="text-[11px] font-mono text-text-primary tabular-nums">{value}</span>
    </div>
  );
}
