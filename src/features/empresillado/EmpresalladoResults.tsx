import { AlertTriangle } from 'lucide-react';
import { type EmpresalladoResult } from '../../lib/calculations/empresillado';
import { type EmpresalladoInputs } from '../../data/defaults';
import { type CheckRow, type CheckStatus } from '../../lib/calculations/types';
import { ambientStyle, checkValueStr, checkLimitStr } from '../../components/checks';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { formatQuantity } from '../../lib/units/format';
import type { Quantity, UnitSystem } from '../../lib/units/types';

interface EmpresalladoResultsProps {
  result: EmpresalladoResult;
  inp: EmpresalladoInputs;
}

type DisplayStatus = Exclude<CheckStatus, 'neutral'>;

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

function CheckRowItem({ check, description, system }: {
  check: CheckRow; description: string; system: UnitSystem;
}) {
  const status = asDisplayStatus(check.status);
  const pct = Math.min(check.utilization * 100, 100);
  return (
    <div
      className="grid items-center gap-3 py-1.75 border-b border-border-sub last:border-b-0"
      style={{ gridTemplateColumns: '1fr auto 112px auto' }}
      data-check-id={check.id}
    >
      <span className="text-[12px] text-text-secondary leading-snug">{description}</span>
      <div className="flex flex-col items-end gap-0 shrink-0">
        <span className="font-mono text-[11px] text-text-primary tabular-nums whitespace-nowrap">{checkValueStr(check, system)}</span>
        <span className="font-mono text-[10px] text-text-disabled tabular-nums whitespace-nowrap">{checkLimitStr(check, system)}</span>
      </div>
      <div className="h-1 bg-border-main rounded-sm overflow-hidden">
        <div className={`h-full rounded-sm ${BAR_CLASSES[status]}`} style={{ width: `${pct}%` }} role="presentation" />
      </div>
      <span className={`font-mono text-[10px] font-semibold px-1.25 py-0.5 rounded tracking-[0.02em] whitespace-nowrap ${STATUS_TAG_CLASSES[status]}`}>
        {check.utilization <= 1 ? `${(check.utilization * 100).toFixed(0)}%` : STATUS_LABEL[status]}
      </span>
    </div>
  );
}

function asDisplayStatus(s: CheckStatus): DisplayStatus {
  return s === 'neutral' ? 'ok' : s;
}

function GroupHeader({ label, description }: { label: string; description?: string }) {
  return (
    <div className="pt-2.25 pb-1.75 border-b border-border-sub mb-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-disabled">
        {label}
      </p>
      {description && (
        <p className="text-[10px] text-text-disabled mt-0.5 leading-tight">{description}</p>
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

export function EmpresalladoResults({ result, inp }: EmpresalladoResultsProps) {
  const { system } = useUnitSystem();
  const fmtSi = (v: number, q: Quantity) => formatQuantity(v, q, system, { precision: 1 });
  const fmtSi2 = (v: number, q: Quantity) => formatQuantity(v, q, system, { precision: 2 });
  const fmtSi3 = (v: number, q: Quantity) => formatQuantity(v, q, system, { precision: 3 });

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

  // N_chord components for display
  const contrib_N  = inp.N_Ed / 4;
  const contrib_Mx = (Math.abs(inp.Mx_Ed) * 100) / (2 * result.hy);
  const contrib_My = (Math.abs(inp.My_Ed) * 100) / (2 * result.hx);

  return (
    <div className="flex flex-col" aria-label="Resultados" style={ambientStyle(status)}>

      {/* Verdict header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-border-main">
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">
          Resultados calculados
        </span>
        <VerdictBadge status={status} />
      </div>

      {/* Geometry */}
      <GroupHeader
        label="Geometría de la sección compuesta"
        description="Propiedades geométricas de los 4 angulares respecto al eje del pilar reforzado."
      />
      <ValueRow label="Excentricidad centroides (dx / dy)" value={`${result.dx.toFixed(2)} / ${result.dy.toFixed(2)} cm`} />
      <ValueRow label="Separacion entre centroides (hx / hy)" value={`${result.hx.toFixed(2)} / ${result.hy.toFixed(2)} cm`} />
      <ValueRow label="Inercia compuesta (I_X / I_Y)" value={`${result.I_X.toFixed(0)} / ${result.I_Y.toFixed(0)} cm4`} />
      <ValueRow label="Radio de giro compuesto (i_X / i_Y)" value={`${result.i_X.toFixed(3)} / ${result.i_Y.toFixed(3)} cm`} />

      {/* Chord compression */}
      <GroupHeader
        label="Cordones — EC3 §6.4.2"
        description="Axil máximo en el angular más comprimido: N_chord = N_Ed/4 + |Mx|/(2*hy) + |My|/(2*hx)."
      />
      <ValueRow
        label="Formula: N_Ed/4 + Mx + My"
        value={`${formatQuantity(contrib_N, 'force', system, { precision: 1, withUnit: false })} + ${formatQuantity(contrib_Mx, 'force', system, { precision: 1, withUnit: false })} + ${fmtSi(contrib_My, 'force')}`}
      />
      <ValueRow label="Axil maximo en cordon (N_chord)" value={fmtSi(result.N_chord_max, 'force')} />
      {chordCheck && <CheckRowItem check={chordCheck} description="Compresión en cordón — N_chord / N_pl,Rd (EC3 §6.4.2)" system={system} />}

      {/* Local buckling */}
      <GroupHeader
        label="Pandeo local del cordón — EC3 §6.4.2.1"
        description="Pandeo del angular entre pletinas consecutivas. Pletinas soldadas biempotradas: lk = 0.5*s (Tabla 6.8)."
      />
      <ValueRow label="Esbeltez local (lambda_v)" value={result.lambda_v.toFixed(3)} />
      <ValueRow label="Coef. reducción local (chi_v) — curva b" value={result.chi_v.toFixed(3)} />
      {localCheck && <CheckRowItem check={localCheck} description="Pandeo local eje v — N_chord / N_bv,Rd (EC3 §6.4 / §6.3.1)" system={system} />}

      {/* Global buckling */}
      <GroupHeader
        label="Pandeo global de la sección compuesta — EC3 §6.4.3"
        description="Esbeltez efectiva con corrección por pandeo local: lambda_eff = sqrt(lambda_0^2 + lambda_vl^2)."
      />
      <ValueRow label="Esbeltez global no corregida (lambda_0) X / Y" value={`${result.lambda_0X.toFixed(3)} / ${result.lambda_0Y.toFixed(3)}`} />
      <ValueRow label="Esbeltez local aportada (lambda_vl)" value={result.lambda_vl.toFixed(3)} />
      <ValueRow label="Esbeltez efectiva corregida (lambda_eff) X / Y" value={`${result.lambda_effX.toFixed(3)} / ${result.lambda_effY.toFixed(3)}`} />
      <ValueRow label="Coef. reducción de pandeo (chi) X / Y" value={`${result.chi_X.toFixed(3)} / ${result.chi_Y.toFixed(3)}`} />
      <ValueRow label="Chi gobernante (eje más desfavorable)" value={result.chi.toFixed(3)} />
      {globalCheck && <CheckRowItem check={globalCheck} description="Pandeo global — N_Ed / N_b,Rd (EC3 §6.4.3.1)" system={system} />}

      {/* Pletinas */}
      <GroupHeader
        label="Pletinas — EC3 §6.4.3.2"
        description="V_Ed = max(Vd, N_Ed/500). Pletina biempotrada: M_Ed = V_Ed*s/4."
      />
      <ValueRow label="Cortante de diseño en pletina (V_Ed)" value={fmtSi2(result.V_Ed, 'force')} />
      <ValueRow label="Momento flector en pletina (M_Ed)" value={fmtSi3(result.M_Ed_pl, 'moment')} />
      {pletMCheck && <CheckRowItem check={pletMCheck} description="Pletina — flexion — M_Ed / M_pl,Rd (EC3 §6.4.3.2)" system={system} />}
      {pletVCheck && <CheckRowItem check={pletVCheck} description="Pletina — cortante — V_Ed / V_Rd,pl (EC3 §6.4.3.2)" system={system} />}
    </div>
  );
}
