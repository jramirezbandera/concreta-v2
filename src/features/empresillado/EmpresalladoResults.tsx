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
  check: CheckRow; description?: string; system: UnitSystem;
}) {
  if (check.neutral || check.status === 'neutral') return <NeutralRowItem check={check} />;
  const label = description ?? check.description;
  const status = asDisplayStatus(check.status);
  const pct = Math.min(check.utilization * 100, 100);
  return (
    <div
      className="grid items-center gap-3 py-1.75 border-b border-border-sub last:border-b-0"
      style={{ gridTemplateColumns: '1fr auto 112px auto' }}
      data-check-id={check.id}
    >
      <span className="text-[12px] text-text-secondary leading-snug">{label}</span>
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

/** Fila informativa (sin barra ni %): hipótesis y límites del modelo. */
function NeutralRowItem({ check }: { check: CheckRow }) {
  return (
    <div
      className="flex items-start justify-between gap-3 py-1.75 border-b border-border-sub last:border-b-0"
      data-check-id={check.id}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[12px] text-text-secondary leading-snug">{check.description}</span>
        {check.article && (
          <span className="font-mono text-[10px] text-text-disabled">{check.article}</span>
        )}
      </div>
      <span className="font-mono text-[10px] font-semibold px-1.25 py-0.5 rounded tracking-[0.02em] whitespace-nowrap shrink-0 bg-state-neutral/10 text-state-neutral">
        {check.tag ?? '—'}
      </span>
    </div>
  );
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

  const byId = (id: string) => result.checks.find((c) => c.id === id);
  const chordCheck   = byId('cordones');
  const localCheck   = byId('pandeo-local');
  const interCheck   = byId('cordon-interaccion');
  const globalCheck  = byId('pandeo-global');
  const pletMCheck   = byId('pletina-flexion');
  const pletVCheck   = byId('pletina-cortante');
  const sepCheck     = byId('sep-presillas');
  const scopeNote    = byId('scope-note');

  // Red de seguridad: cualquier comprobación que el motor añada y que este
  // panel no coloque explícitamente se pinta igual al final. Antes el panel
  // elegía 5 ids a mano y `cordon-interaccion` (la que gobernaba el INCUMPLE)
  // no se pintaba en ninguna parte: veredicto en rojo sin fila que lo explique.
  const PLACED = new Set([
    'cordones', 'pandeo-local', 'cordon-interaccion', 'pandeo-global',
    'pletina-flexion', 'pletina-cortante', 'sep-presillas', 'scope-note',
  ]);
  const unplaced = result.checks.filter((c) => !PLACED.has(c.id));

  // Descomposición de N_chord — con los momentos de SEGUNDO orden y la inercia
  // exacta, que es lo que usa el motor. Con el primer orden (Mx/(2·hy)) los
  // sumandos no sumaban el N_chord de la fila siguiente.
  const contrib_N  = inp.N_Ed / 4;
  const contrib_Mx = (result.MEd_IIX * 100 * result.A_ang * result.dy) / result.I_X;
  const contrib_My = (result.MEd_IIY * 100 * result.A_ang * result.dx) / result.I_Y;

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
        label="Cordones — CE Anejo 22 §6.4.2"
        description="Axil máximo en el angular más comprimido: N_chord = N_Ed/4 + M_Ed,II,X·A·dy/I_X + M_Ed,II,Y·A·dx/I_Y, con los momentos de 2º orden (ec. 6.69)."
      />
      <ValueRow
        label="Momento de 2º orden (M_Ed,II) X / Y"
        value={`${fmtSi2(result.MEd_IIX, 'moment')} / ${fmtSi2(result.MEd_IIY, 'moment')}`}
      />
      <ValueRow
        label="Formula: N_Ed/4 + M_Ed,II,X + M_Ed,II,Y"
        value={`${formatQuantity(contrib_N, 'force', system, { precision: 1, withUnit: false })} + ${formatQuantity(contrib_Mx, 'force', system, { precision: 1, withUnit: false })} + ${fmtSi(contrib_My, 'force')}`}
      />
      <ValueRow label="Axil maximo en cordon (N_chord)" value={fmtSi(result.N_chord_max, 'force')} />
      {chordCheck && <CheckRowItem check={chordCheck} description="Compresión en cordón — N_chord / N_pl,Rd (CE Anejo 22 §6.4.2)" system={system} />}

      {/* Local buckling */}
      <GroupHeader
        label="Pandeo local del cordón — CE Anejo 22 §6.4.2.1"
        description="Pandeo del angular entre pletinas consecutivas. Longitud de pandeo lk = s (separación entre presillas, lado seguro: no se cuenta el empotramiento en la presilla)."
      />
      <ValueRow label="Esbeltez local (lambda_v)" value={result.lambda_v.toFixed(3)} />
      <ValueRow label="Coef. reducción local (chi_v) — curva b" value={result.chi_v.toFixed(3)} />
      {localCheck && <CheckRowItem check={localCheck} description="Pandeo local eje v — N_chord / N_bv,Rd (CE Anejo 22 §6.4 / §6.3.1)" system={system} />}

      {/* Chord interaction — axial + Vierendeel bending */}
      <GroupHeader
        label="Cordón — axil + flexión Vierendeel — CE Anejo 22 §6.4.3.1(1)"
        description="El cortante hace trabajar el cordón como pieza Vierendeel entre presillas: M_ch = V_Ed*s/8 se suma al axil."
      />
      <ValueRow label="Momento local en el cordón (M_ch)" value={fmtSi3(result.M_ch, 'moment')} />
      <ValueRow label="Capacidad elástica del angular (M_el,Rd)" value={fmtSi3(result.M_el_Rd, 'moment')} />
      {interCheck && (
        <CheckRowItem
          check={interCheck}
          description="Cordón — interacción N_chord/N_bv,Rd + M_ch/M_el,Rd ≤ 1 (CE Anejo 22 §6.4.3.1(1))"
          system={system}
        />
      )}

      {/* Global buckling */}
      <GroupHeader
        label="Pandeo global de la sección compuesta — CE Anejo 22 §6.4.3"
        description="Esbeltez efectiva con corrección por pandeo local: lambda_eff = sqrt(lambda_0^2 + lambda_vl^2)."
      />
      <ValueRow label="Esbeltez global no corregida (lambda_0) X / Y" value={`${result.lambda_0X.toFixed(3)} / ${result.lambda_0Y.toFixed(3)}`} />
      <ValueRow label="Esbeltez local aportada (lambda_vl)" value={result.lambda_vl.toFixed(3)} />
      <ValueRow label="Esbeltez efectiva corregida (lambda_eff) X / Y" value={`${result.lambda_effX.toFixed(3)} / ${result.lambda_effY.toFixed(3)}`} />
      <ValueRow label="Coef. reducción de pandeo (chi) X / Y" value={`${result.chi_X.toFixed(3)} / ${result.chi_Y.toFixed(3)}`} />
      <ValueRow label="Chi gobernante (eje más desfavorable)" value={result.chi.toFixed(3)} />
      {globalCheck && <CheckRowItem check={globalCheck} description="Pandeo global — N_Ed / N_b,Rd (CE Anejo 22 §6.4.3.1)" system={system} />}

      {/* Pletinas */}
      <GroupHeader
        label="Pletinas — CE Anejo 22 §6.4.3.2"
        description="V_Ed = π*M_Ed,II/L + Vd (§6.4.1(7)). Pletina biempotrada en 2 planos: M_Ed = V_Ed*s/4; cortante interno T = (V_Ed/2)*s/h₀."
      />
      <ValueRow label="Cortante de diseño en pletina (V_Ed)" value={fmtSi2(result.V_Ed, 'force')} />
      <ValueRow label="Momento flector en pletina (M_Ed)" value={fmtSi3(result.M_Ed_pl, 'moment')} />
      <ValueRow label="Cortante interno de la pletina (T)" value={fmtSi2(result.T_pl, 'force')} />
      {pletMCheck && <CheckRowItem check={pletMCheck} description="Pletina — flexion — M_Ed / M_pl,Rd (CE Anejo 22 §6.4.3.2)" system={system} />}
      {pletVCheck && <CheckRowItem check={pletVCheck} description="Pletina — cortante — T / V_Rd,pl (CE Anejo 22 §6.4.3.2)" system={system} />}

      {/* Disposición constructiva + alcance del modelo */}
      <GroupHeader
        label="Disposición y alcance del modelo"
        description="Limitación de esbeltez local entre presillas e hipótesis no comprobadas por el módulo."
      />
      {sepCheck && <CheckRowItem check={sepCheck} system={system} />}
      {scopeNote && <NeutralRowItem check={scopeNote} />}

      {/* Cualquier comprobación futura no colocada arriba: nunca invisible. */}
      {unplaced.map((c) => <CheckRowItem key={c.id} check={c} system={system} />)}
    </div>
  );
}
