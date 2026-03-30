import { type RCBeamResult, type RCBeamSectionResult, type CheckRow, type CheckStatus } from '../../lib/calculations/rcBeams';

interface RCBeamsResultsProps {
  result: RCBeamResult;
  activeSection: 'vano' | 'apoyo';
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
  ok:   'bg-state-ok/10 text-state-ok',
  warn: 'bg-state-warn/10 text-state-warn',
  fail: 'bg-state-fail/10 text-state-fail',
};

const BAR_CLASSES: Record<CheckStatus, string> = {
  ok:   'bg-state-ok',
  warn: 'bg-state-warn',
  fail: 'bg-state-fail',
};

const BORDER_CLASSES: Record<CheckStatus, string> = {
  ok:   'border-state-ok/40',
  warn: 'border-state-warn/40',
  fail: 'border-state-fail/40',
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
  const pct = isFinite(check.utilization) ? Math.min(check.utilization * 100, 100) : 100;
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
        {isFinite(check.utilization) && check.utilization <= 1
          ? `${(check.utilization * 100).toFixed(0)}%`
          : STATUS_LABEL[check.status]}
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

function SectionBlock({
  title,
  section,
  isActive,
}: {
  title: string;
  section: RCBeamSectionResult;
  isActive: boolean;
}) {
  if (!section.valid) {
    return (
      <div className={`rounded border px-4 py-3 ${isActive ? 'border-state-fail/40' : 'border-border-main'}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-text-secondary">{title}</span>
        </div>
        <p className="text-[12px] text-state-fail">{section.error ?? 'Datos invalidos'}</p>
      </div>
    );
  }

  const status = overallStatus(section.checks);
  const bendingChecks = section.checks.filter((c) =>
    ['bending', 'bending-over', 'as-min', 'as-min-comp', 'as-max'].includes(c.id),
  );
  const shearChecks = section.checks.filter((c) =>
    ['shear', 'shear-max', 'rho-w-min', 'stirrup-spacing-max'].includes(c.id),
  );
  const spacingChecks = section.checks.filter((c) =>
    ['bar-spacing', 'bar-spacing-impossible'].includes(c.id),
  );
  const crackingChecks = section.checks.filter((c) => c.id === 'cracking');

  return (
    <div
      className={[
        'rounded border px-4 py-3 transition-colors',
        isActive ? `border-2 ${BORDER_CLASSES[status]}` : 'border-border-main',
      ].join(' ')}
    >
      {/* Section header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-border-main">
        <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-text-secondary">{title}</span>
        <VerdictBadge status={status} />
      </div>

      {/* Key values */}
      <GroupHeader label="Valores" />
      <ValueRow label="d (canto util)"    value={`${section.d.toFixed(0)} mm`} />
      <ValueRow label="As (traccion)"      value={`${section.As.toFixed(0)} mm\u00b2`} />
      <ValueRow label="As,c (compresion)" value={`${section.AsComp.toFixed(0)} mm\u00b2`} />
      <ValueRow label="x (eje neutro)"    value={`${section.x.toFixed(0)} mm`} />
      <ValueRow label="MRd"               value={`${section.MRd.toFixed(1)} kNm`} />
      <ValueRow label="VRd"               value={`${section.VRd.toFixed(1)} kN`} />
      <ValueRow label="wk"                value={`${section.wk.toFixed(3)} mm`} />

      {/* Check groups */}
      <GroupHeader label="ELU Flexion" />
      {bendingChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      <GroupHeader label="ELU Cortante" />
      {shearChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {spacingChecks.length > 0 && (
        <>
          <GroupHeader label="Separacion barras" />
          {spacingChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}
        </>
      )}

      <GroupHeader label="ELS Fisuracion" />
      {crackingChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {/* Rebar info footer */}
      <div className="mt-3 pt-2 border-t border-border-sub space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-disabled">Despiece</span>
          <span className="font-mono text-[11px] text-text-primary">{section.rebarSchedule}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-disabled">Solape min. (CE art. 69.5.2)</span>
          <span className="font-mono text-[11px] text-text-primary">{section.lapLength} mm</span>
        </div>
      </div>
    </div>
  );
}

export function RCBeamsResults({ result, activeSection }: RCBeamsResultsProps) {
  if (!result.valid) {
    return (
      <div className="flex items-center justify-center h-24 rounded border border-state-fail/30 bg-state-fail/5">
        <p className="text-[12px] text-state-fail text-center px-3">{result.error ?? 'Datos invalidos'}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" aria-label="Resultados">
      <SectionBlock
        title="Vano"
        section={result.vano}
        isActive={activeSection === 'vano'}
      />
      <SectionBlock
        title="Apoyo"
        section={result.apoyo}
        isActive={activeSection === 'apoyo'}
      />
    </div>
  );
}
