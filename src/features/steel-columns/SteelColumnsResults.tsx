import { AlertTriangle } from 'lucide-react';
import { type SteelColumnResult } from '../../lib/calculations/steelColumns';
import { type SteelCheckRow, type SteelCheckStatus } from '../../lib/calculations/steelBeams';
import { resultLabel } from '../../lib/text/labels';
import { ambientStyle } from '../../components/checks';

interface SteelColumnsResultsProps {
  result: SteelColumnResult | null;
  zeroLoads: boolean;
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

function NeutralCheckRow({ check, muted }: { check: SteelCheckRow; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.75 border-b border-border-sub last:border-b-0 ${muted ? 'opacity-50' : ''}`}>
      <span className="text-[12px] text-text-secondary leading-snug">{check.description}</span>
      <span className="font-mono text-[10px] font-semibold px-1.25 py-0.5 rounded tracking-[0.02em] whitespace-nowrap bg-state-neutral/10 text-state-neutral">
        {check.tag ?? '—'}
      </span>
    </div>
  );
}

function ActiveCheckRow({ check, muted }: { check: SteelCheckRow; muted?: boolean }) {
  const status = check.status as DisplayStatus;
  const pct = muted ? 0 : Math.min(check.utilization * 100, 100);
  return (
    <div
      className={`grid items-center gap-3 py-1.75 border-b border-border-sub last:border-b-0 ${muted ? 'opacity-50' : ''}`}
      style={{ gridTemplateColumns: '1fr auto 112px auto' }}
    >
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
          className={`h-full rounded-sm ${muted ? 'bg-state-neutral' : BAR_CLASSES[status]}`}
          style={{ width: `${pct}%` }}
          role="presentation"
        />
      </div>
      <span className={`font-mono text-[10px] font-semibold px-1.25 py-0.5 rounded tracking-[0.02em] whitespace-nowrap ${muted ? 'bg-state-neutral/10 text-state-neutral' : STATUS_TAG_CLASSES[status]}`}>
        {muted
          ? '—'
          : check.utilization <= 1
            ? `${(check.utilization * 100).toFixed(0)}%`
            : STATUS_LABEL[status]}
      </span>
    </div>
  );
}

function CheckRowItem({ check, muted }: { check: SteelCheckRow; muted?: boolean }) {
  if (check.neutral) return <NeutralCheckRow check={check} muted={muted} />;
  return <ActiveCheckRow check={check} muted={muted} />;
}

function GroupHeader({ label, code, subtitle }: { label: string; code?: string; subtitle?: string }) {
  return (
    <div className="pt-2.25 pb-1.75 border-b border-border-sub mb-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-disabled">
          {label}
        </span>
        {code && (
          <span className="text-[9px] font-mono text-text-disabled tracking-tight whitespace-nowrap">
            {code}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="text-[10px] font-mono text-text-secondary mt-0.5 leading-snug">{subtitle}</p>
      )}
    </div>
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

export function SteelColumnsResults({ result, zeroLoads }: SteelColumnsResultsProps) {
  // No result yet
  if (!result) {
    return (
      <div className="flex items-center justify-center h-24">
        <p className="text-[12px] text-text-disabled">Introduce los datos para ver resultados</p>
      </div>
    );
  }

  // Invalid result (class 4 or unknown profile)
  if (!result.valid) {
    return (
      <div className="flex flex-col">
        {/* Verdict header — SIN SOLUCIÓN */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-border-main">
          <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">
            Resultados calculados
          </span>
          <span
            className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold px-1.25 py-0.5 rounded tracking-[0.02em] bg-state-fail/10 text-state-fail"
            role="status"
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} aria-hidden="true" />
            SIN SOLUCIÓN
          </span>
        </div>
        <div className="flex items-start gap-3 rounded border border-state-fail/30 bg-state-fail/5 px-3 py-3 mb-3">
          <AlertTriangle size={16} className="text-state-fail mt-0.5 shrink-0" />
          <div>
            <p className="text-[12px] text-state-fail font-semibold mb-0.5">
              {result.sectionClass === 4 ? 'Sección clase 4' : 'Sección no disponible'}
            </p>
            <p className="text-[11px] text-text-secondary">
              {result.error ?? 'Las secciones clase 4 (esbeltez elevada) no están implementadas en v1. Elija un perfil más robusto.'}
            </p>
            <p className="text-[10px] text-text-disabled mt-1.5">
              Exportación a PDF deshabilitada.
            </p>
          </div>
        </div>
        {result.checks.length > 0 && (
          <div>
            {result.checks.map((c) => <CheckRowItem key={c.id} check={c} />)}
          </div>
        )}
      </div>
    );
  }

  const status = overallStatus(result.checks);
  const hasLTB = !result.isBox && result.kind !== 'CHS' && isFinite(result.Mcr) && result.Mcr > 0;

  const sectionChecks  = result.checks.filter((c) => c.id === 'class');
  const resistChecks   = result.checks.filter((c) => ['NRd', 'MyRd', 'MzRd', 'MRes'].includes(c.id));
  const bucklingChecks = result.checks.filter((c) => ['Nby', 'Nbz'].includes(c.id));
  const ltbChecks      = result.checks.filter((c) => c.id === 'LTB');
  const intChecks      = result.checks.filter((c) => ['int1', 'int2'].includes(c.id));
  const slendChecks    = result.checks.filter((c) => ['sy', 'sz'].includes(c.id));

  const isCHS = result.kind === 'CHS';
  const resistSubtitle = isCHS && result.M_res !== undefined && result.M_res > 0
    ? `CHS axisimétrico — M_res = √(My² + Mz²) = ${result.M_res.toFixed(1)} kNm`
    : undefined;

  return (
    <div className="flex flex-col" aria-label="Resultados" style={ambientStyle(status)}>

      {/* Verdict header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-border-main">
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">
          Resultados calculados
        </span>
        {zeroLoads ? (
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold px-1.25 py-0.5 rounded tracking-[0.02em] bg-state-neutral/10 text-state-neutral" role="status">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} aria-hidden="true" />
            SIN CARGAS
          </span>
        ) : (
          <VerdictBadge status={status} />
        )}
      </div>

      {/* Key values */}
      <GroupHeader label="Valores" />
      <ValueRow label={resultLabel('NRd_steel')}    value={`${result.NRd.toFixed(1)} kN`} />
      <ValueRow label={resultLabel('MRd_y')}        value={`${result.My_Rd.toFixed(1)} kNm`} />
      <ValueRow label={resultLabel('MRd_z')}        value={`${result.Mz_Rd.toFixed(1)} kNm`} />
      <ValueRow label={resultLabel('Nb_Rd_y')}      value={`${result.Nb_Rd_y.toFixed(1)} kN`} />
      <ValueRow label={resultLabel('Nb_Rd_z')}      value={`${result.Nb_Rd_z.toFixed(1)} kN`} />
      <ValueRow label={resultLabel('chi_y')}        value={result.chi_y.toFixed(3)} />
      <ValueRow label={resultLabel('chi_z')}        value={result.chi_z.toFixed(3)} />
      <ValueRow label={resultLabel('lambda_bar_y')} value={result.lambda_y.toFixed(3)} />
      <ValueRow label={resultLabel('lambda_bar_z')} value={result.lambda_z.toFixed(3)} />
      {hasLTB && (
        <>
          <ValueRow label={resultLabel('Mcr')}    value={`${result.Mcr.toFixed(1)} kNm`} />
          <ValueRow label={resultLabel('chi_LT')} value={result.chi_LT.toFixed(3)} />
          <ValueRow label={resultLabel('Mb_Rd')}  value={`${result.Mb_Rd.toFixed(1)} kNm`} />
        </>
      )}

      {/* Section classification */}
      <GroupHeader label="Sección" code="EC3 §5.5" />
      {sectionChecks.map((c) => <CheckRowItem key={c.id} check={c} muted={zeroLoads} />)}

      {/* Resistencias sección */}
      <GroupHeader label="Resistencia sección" code="EC3 §6.2.5" subtitle={resistSubtitle} />
      {resistChecks.map((c) => <CheckRowItem key={c.id} check={c} muted={zeroLoads} />)}

      {/* Pandeo */}
      <GroupHeader label="Pandeo (ELU)" code="EC3 §6.3.1" />
      {bucklingChecks.map((c) => <CheckRowItem key={c.id} check={c} muted={zeroLoads} />)}

      {/* LTB — only when applicable */}
      {hasLTB && (
        <>
          <GroupHeader label="Pandeo lateral (LTB)" code="EC3 §6.3.2" />
          {ltbChecks.map((c) => <CheckRowItem key={c.id} check={c} muted={zeroLoads} />)}
        </>
      )}

      {/* Interacción */}
      <GroupHeader label="Interacción N+M" code="EC3 §6.3.3" />
      {intChecks.map((c) => <CheckRowItem key={c.id} check={c} muted={zeroLoads} />)}

      {/* Esbeltez */}
      <GroupHeader label="Esbeltez" code="EAE §35.2.1" />
      {slendChecks.map((c) => <CheckRowItem key={c.id} check={c} muted={zeroLoads} />)}
    </div>
  );
}
