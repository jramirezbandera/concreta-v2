import { type TimberColumnResult, type TimberColumnCheckRow, type CheckStatus } from '../../lib/calculations/timberColumns';
import { resultLabel } from '../../lib/text/labels';
import { ambientStyle } from '../../components/checks';

interface Props {
  result: TimberColumnResult;
}

const STATUS_LABEL: Record<CheckStatus, string> = {
  ok:   'CUMPLE',
  warn: 'ADVERT.',
  fail: 'INCUMPLE',
};

const STATUS_TAG: Record<CheckStatus, string> = {
  ok:   'bg-state-ok/10 text-state-ok',
  warn: 'bg-state-warn/10 text-state-warn',
  fail: 'bg-state-fail/10 text-state-fail',
};

const BAR_CLS: Record<CheckStatus, string> = {
  ok:   'bg-state-ok',
  warn: 'bg-state-warn',
  fail: 'bg-state-fail',
};

function VerdictBadge({ status }: { status: CheckStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold px-1.25 py-0.5 rounded tracking-[0.02em] ${STATUS_TAG[status]}`} role="status">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function GroupHeader({ label, status }: { label: string; status?: CheckStatus }) {
  return (
    <div className="flex items-center justify-between pt-2.25 pb-1.75 border-b border-border-sub mb-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-disabled">{label}</p>
      {status && <VerdictBadge status={status} />}
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

function NeutralRow({ check }: { check: TimberColumnCheckRow }) {
  return (
    <div className="flex items-center justify-between py-1.75 border-b border-border-sub last:border-b-0">
      <span className="text-[12px] text-text-secondary leading-snug">{check.description}</span>
      {check.tag && (
        <span className="font-mono text-[10px] font-semibold px-1.25 py-0.5 rounded tracking-[0.02em] whitespace-nowrap bg-state-neutral/10 text-state-neutral">
          {check.tag}
        </span>
      )}
    </div>
  );
}

function ActiveRow({ check }: { check: TimberColumnCheckRow }) {
  const st  = check.status;
  const pct = Math.min(check.utilization * 100, 100);
  return (
    <div className="grid items-start gap-3 py-1.75 border-b border-border-sub last:border-b-0"
      style={{ gridTemplateColumns: '1fr auto 112px auto' }}>
      <div>
        <span className="text-[12px] text-text-secondary leading-snug block">{check.description}</span>
        {check.article && (
          <span className="text-[10px] font-mono text-text-disabled leading-snug block mt-0.5">{check.article}</span>
        )}
      </div>
      <div className="text-right">
        <span className="text-[11px] font-mono text-text-primary block tabular-nums">{check.value}</span>
        <span className="text-[10px] font-mono text-text-disabled block tabular-nums">{`≤ ${check.limit}`}</span>
      </div>
      <div className="flex flex-col gap-1 justify-center min-w-0">
        <div className="h-1 rounded-sm bg-border-main overflow-hidden mt-1">
          <div className={`h-full rounded-sm ${BAR_CLS[st]}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] font-mono text-text-disabled tabular-nums">
          {`${(check.utilization * 100).toFixed(0)}%`}
        </span>
      </div>
      <VerdictBadge status={st} />
    </div>
  );
}

export function TimberColumnsResults({ result }: Props) {
  if (!result.valid) {
    return (
      <div className="rounded border border-state-fail/30 bg-state-fail/5 px-4 py-3">
        <p className="text-[12px] text-state-fail font-mono">{result.error ?? 'Error de cálculo'}</p>
      </div>
    );
  }

  const activeChecks = result.checks.filter(c => !c.neutral);
  const hasFail = activeChecks.some(c => c.status === 'fail');
  const hasWarn = activeChecks.some(c => c.status === 'warn');
  const overall: CheckStatus = hasFail ? 'fail' : hasWarn ? 'warn' : 'ok';

  const eluChecks  = result.checks.filter(c => c.group === 'elu');
  const fireChecks = result.checks.filter(c => c.group === 'fire');

  const eluActive  = eluChecks.filter(c => !c.neutral);
  const eluFail    = eluActive.some(c => c.status === 'fail');
  const eluWarn    = eluActive.some(c => c.status === 'warn');
  const eluStatus: CheckStatus = eluFail ? 'fail' : eluWarn ? 'warn' : 'ok';

  return (
    <div className="space-y-4" style={ambientStyle(overall)}>

      {/* Overall verdict */}
      <div className="flex items-center justify-between pb-3 border-b border-border-main">
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">Resultados calculados</span>
        <VerdictBadge status={overall} />
      </div>

      {/* Key values */}
      <div>
        <GroupHeader label="Parámetros EC5" />
        <div className="divide-y divide-border-sub">
          <ValueRow label={resultLabel('kmod')}           value={result.kmod.toFixed(2)} />
          <ValueRow label={resultLabel('gamma_M_timber')} value={result.gammaM.toFixed(2)} />
          <ValueRow label="kh"                            value={result.kh.toFixed(3)} />
          <ValueRow label={resultLabel('fc0_d')}          value={`${result.fc0_d.toFixed(2)} N/mm²`} />
          <ValueRow label={resultLabel('fm_d')}           value={`${result.fm_d.toFixed(2)} N/mm²`} />
          <ValueRow label={resultLabel('fv_d')}           value={`${result.fv_d.toFixed(2)} N/mm²`} />
        </div>
      </div>

      <div>
        <GroupHeader label="Pandeo EC5 §6.3.2" />
        <div className="divide-y divide-border-sub">
          <ValueRow label="Lef,y (eje fuerte)" value={`${(result.Lef_y / 1000).toFixed(2)} m`} />
          <ValueRow label="Lef,z (eje débil)"  value={`${(result.Lef_z / 1000).toFixed(2)} m`} />
          <ValueRow label="λy (eje fuerte)"    value={result.lambda_y.toFixed(1)} />
          <ValueRow label="λz (eje débil)"     value={result.lambda_z.toFixed(1)} />
          <ValueRow label="λrel,y"             value={result.lambda_rel_y.toFixed(3)} />
          <ValueRow label="λrel,z"             value={result.lambda_rel_z.toFixed(3)} />
          <ValueRow label={resultLabel('kc_y')} value={result.kc_y.toFixed(3)} />
          <ValueRow label={resultLabel('kc_z')} value={result.kc_z.toFixed(3)} />
        </div>
      </div>

      <div>
        <GroupHeader label="Tensiones" />
        <div className="divide-y divide-border-sub">
          <ValueRow label="σc,0,d"  value={`${result.sigma_c.toFixed(2)} N/mm²`} />
          <ValueRow label="σm,d"    value={`${result.sigma_m.toFixed(2)} N/mm²`} />
          <ValueRow label="τd"      value={`${result.tau_d.toFixed(2)} N/mm²`} />
        </div>
      </div>

      {/* Fire section info */}
      {result.fireActive && (
        <div>
          <GroupHeader label={`Sección residual R${result.t_fire}`} />
          <div className="divide-y divide-border-sub">
            <ValueRow label={resultLabel('dchar')}           value={`${result.dchar.toFixed(1)} mm`} />
            <ValueRow label={resultLabel('def_penetration')} value={`${result.def.toFixed(1)} mm`} />
            <ValueRow label="Secc. residual"                 value={`${result.b_ef.toFixed(0)} × ${result.h_ef.toFixed(0)} mm`} />
          </div>
        </div>
      )}

      {/* Checks: ELU */}
      <div>
        <GroupHeader label="ELU — Verificaciones" status={eluStatus} />
        <div>
          {eluChecks.map(ch =>
            ch.neutral
              ? <NeutralRow key={ch.id} check={ch} />
              : <ActiveRow key={ch.id} check={ch} />,
          )}
        </div>
      </div>

      {/* Checks: Fire */}
      {fireChecks.length > 0 && (() => {
        const fireActive2 = fireChecks.filter(c => !c.neutral);
        const fireFail = fireActive2.some(c => c.status === 'fail');
        const fireWarn = fireActive2.some(c => c.status === 'warn');
        const fireStatus: CheckStatus = fireFail ? 'fail' : fireWarn ? 'warn' : 'ok';
        return (
        <div>
          <GroupHeader label="Fuego — Verificaciones" status={fireStatus} />
          <div>
            {fireChecks.map(ch =>
              ch.neutral
                ? <NeutralRow key={ch.id} check={ch} />
                : <ActiveRow key={ch.id} check={ch} />,
            )}
          </div>
        </div>
        );
      })()}

    </div>
  );
}
