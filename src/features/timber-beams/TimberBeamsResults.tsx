import { type TimberBeamResult, type TimberCheckRow, type CheckStatus } from '../../lib/calculations/timberBeams';
import { resultLabel } from '../../lib/text/labels';

interface Props {
  result: TimberBeamResult;
}

// ── Status helpers ────────────────────────────────────────────────────────────

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

// ── Sub-components ────────────────────────────────────────────────────────────

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

function NeutralRow({ check }: { check: TimberCheckRow }) {
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

function ActiveRow({ check }: { check: TimberCheckRow }) {
  const st  = check.status;
  const pct = Math.min(check.utilization * 100, 100);
  return (
    <div className="grid items-start gap-3 py-1.75 border-b border-border-sub last:border-b-0"
      style={{ gridTemplateColumns: '1fr auto 112px auto' }}>
      {/* Description + normative reference */}
      <div>
        <span className="text-[12px] text-text-secondary leading-snug block">{check.description}</span>
        {check.article && (
          <span className="text-[10px] font-mono text-text-disabled leading-snug block mt-0.5">{check.article}</span>
        )}
      </div>
      {/* Value / limit stacked */}
      <div className="flex flex-col items-end gap-0 shrink-0 pt-0.5">
        <span className="font-mono text-[11px] text-text-primary tabular-nums whitespace-nowrap">{check.value}</span>
        <span className="font-mono text-[10px] text-text-disabled tabular-nums whitespace-nowrap">{check.limit}</span>
      </div>
      {/* Utilization bar */}
      <div className="h-1 bg-border-main rounded-sm overflow-hidden mt-1.5">
        <div className={`h-full rounded-sm ${BAR_CLS[st]}`} style={{ width: `${pct}%` }} />
      </div>
      {/* Badge: % when ≤ 100%, text when failing */}
      <span className={`font-mono text-[10px] font-semibold px-1.25 py-0.5 rounded tracking-[0.02em] whitespace-nowrap ${STATUS_TAG[st]}`}>
        {check.utilization <= 1
          ? `${(check.utilization * 100).toFixed(0)}%`
          : STATUS_LABEL[st]}
      </span>
    </div>
  );
}

function CheckRows({ checks }: { checks: TimberCheckRow[] }) {
  // Filter out section-header neutral rows (rendered via GroupHeader separately)
  const rows = checks.filter(c => !c.id.endsWith('-header'));
  if (rows.length === 0) return null;
  return (
    <div className="rounded border border-border-sub divide-y divide-border-sub px-3 mb-3">
      {rows.map(c => c.neutral
        ? <NeutralRow key={c.id} check={c} />
        : <ActiveRow  key={c.id} check={c} />)}
    </div>
  );
}

function groupStatus(checks: TimberCheckRow[]): CheckStatus {
  const active = checks.filter(c => !c.neutral);
  if (active.some(c => c.status === 'fail')) return 'fail';
  if (active.some(c => c.status === 'warn')) return 'warn';
  return 'ok';
}

// ── Main component ────────────────────────────────────────────────────────────

export function TimberBeamsResults({ result }: Props) {
  if (!result.valid) {
    return (
      <div className="flex items-start gap-2 rounded border border-state-fail/30 bg-state-fail/5 px-3 py-2 mt-4">
        <span className="text-[12px] text-state-fail">{result.error ?? 'Error desconocido'}</span>
      </div>
    );
  }

  const activeChecks = result.checks.filter(c => !c.neutral);
  const hasFail  = activeChecks.some(c => c.status === 'fail');
  const hasWarn  = activeChecks.some(c => c.status === 'warn');
  const overall: CheckStatus = hasFail ? 'fail' : hasWarn ? 'warn' : 'ok';

  const eluChecks  = result.checks.filter(c => c.group === 'elu');
  const elsChecks  = result.checks.filter(c => c.group === 'els');
  const fireChecks = result.checks.filter(c => c.group === 'fire');

  // fm_d_sys = fm_d_kh × ksys (effective bending design strength)
  const fm_d_sys = result.fm_d_kh * result.ksys;

  return (
    <div className="flex flex-col" aria-label="Resultados">

      {/* ── Verdict header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-border-main">
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">
          Resultados calculados
        </span>
        <VerdictBadge status={overall} />
      </div>

      {/* ── Factores de modificación ────────────────────────────────────── */}
      <GroupHeader label="Factores de modificación  (EC5 §2.4)" />
      <div className="rounded border border-border-sub divide-y divide-border-sub px-3 mb-3">
        <ValueRow label={resultLabel('kmod')}           value={result.kmod.toFixed(2)} />
        <ValueRow label="kh — factor de tamaño  (EC5 §3.2 / §3.3)" value={result.kh.toFixed(3)} />
        <ValueRow label={resultLabel('kcr')}            value={result.kcr.toFixed(2)} />
        <ValueRow label={resultLabel('ksys')}           value={result.ksys.toFixed(2)} />
        <ValueRow label={resultLabel('kdef')}           value={result.kdef.toFixed(2)} />
        <ValueRow label={resultLabel('gamma_M_timber')} value={result.gammaM.toFixed(2)} />
        <ValueRow label={resultLabel('psi2')}           value={result.psi2.toFixed(2)} />
      </div>

      {/* ── ELU ─────────────────────────────────────────────────────────── */}
      <GroupHeader label="ELU — Estado Límite Último" status={groupStatus(eluChecks)} />
      <div className="rounded border border-border-sub divide-y divide-border-sub px-3 mb-1.5">
        <ValueRow label={resultLabel('MEd')} value={`${result.MEd.toFixed(2)} kNm`} />
        <ValueRow label={resultLabel('VEd')} value={`${result.VEd.toFixed(2)} kN`}  />
        <ValueRow label="σm,d — tensión de flexión" value={`${result.sigma_m.toFixed(2)} N/mm²`} />
        <ValueRow label="fm,d · kh · ksys — resist. flexión efectiva  (EC5 §6.1.6)" value={`${fm_d_sys.toFixed(2)} N/mm²`} />
        <ValueRow label="τd — tensión cortante (Av = kcr·A)" value={`${result.tau_d.toFixed(2)} N/mm²`} />
        <ValueRow label={resultLabel('fv_d')} value={`${result.fv_d.toFixed(2)} N/mm²`} />
        <ValueRow label={resultLabel('lambda_rel')} value={result.lambda_rel_m.toFixed(3)} />
        <ValueRow label={resultLabel('kcrit')} value={result.kcrit.toFixed(3)} />
      </div>
      <CheckRows checks={eluChecks} />

      {/* ── ELS ─────────────────────────────────────────────────────────── */}
      <GroupHeader label="ELS — Deformaciones  (EC5 §7.2 / NA España)" status={groupStatus(elsChecks)} />
      <div className="rounded border border-border-sub divide-y divide-border-sub px-3 mb-1.5">
        <ValueRow label={resultLabel('u_inst')}    value={`${result.u_inst.toFixed(1)} mm`} />
        <ValueRow label="Límite instantánea  (L/300)"  value={`${result.u_inst_lim.toFixed(1)} mm`} />
        <ValueRow label={resultLabel('u_fin')}     value={`${result.u_fin.toFixed(1)} mm`} />
        <ValueRow label="Límite final  (L/250)"        value={`${result.u_fin_lim.toFixed(1)} mm`} />
        <ValueRow label={resultLabel('u_active')}  value={`${result.u_active.toFixed(1)} mm`} />
        <ValueRow label="Límite activa  (L/350)"       value={`${result.u_active_lim.toFixed(1)} mm`} />
      </div>
      <CheckRows checks={elsChecks} />

      {/* ── Fuego ───────────────────────────────────────────────────────── */}
      {result.fireActive && (
        <>
          <GroupHeader label={`Incendio — R${result.t_fire}  (EN 1995-1-2 §4.2.2)`} status={groupStatus(fireChecks)} />
          <div className="rounded border border-border-sub divide-y divide-border-sub px-3 mb-1.5">
            <ValueRow label={resultLabel('beta_n')}           value={`${result.betaN.toFixed(2)} mm/min`} />
            <ValueRow label={resultLabel('dchar')}            value={`${result.dchar.toFixed(1)} mm`} />
            <ValueRow label={resultLabel('d0_zeroStrength')}  value="7.0 mm" />
            <ValueRow label={resultLabel('def_penetration')}  value={`${result.def.toFixed(1)} mm`} />
            <ValueRow label="Sección residual  b_ef × h_ef"  value={`${result.b_ef.toFixed(0)} × ${result.h_ef.toFixed(0)} mm`} />
            <ValueRow label="MEd,fi — combinación incendio (η_fi)"  value={`${result.MEd_fi.toFixed(2)} kNm`} />
            <ValueRow label="VEd,fi — combinación incendio (η_fi)"  value={`${result.VEd_fi.toFixed(2)} kN`} />
            <ValueRow label="fm,k — resist. flexión  (γM,fi = 1.0)" value={`${result.fm_k_fi.toFixed(2)} N/mm²`} />
            <ValueRow label="fv,k — resist. cortante  (γM,fi = 1.0)" value={`${result.fv_k_fi.toFixed(2)} N/mm²`} />
          </div>
          <CheckRows checks={fireChecks} />
        </>
      )}
    </div>
  );
}
