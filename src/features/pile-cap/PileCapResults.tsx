import { type PileCapInputs } from '../../data/defaults';
import { type PileCapResult } from '../../lib/calculations/pileCap';
import { CheckRowItem, GroupHeader, ValueRow, VerdictBadge, overallStatus } from '../../components/checks';
import { resultLabel } from '../../lib/text/labels';

interface Props {
  inp:    PileCapInputs;
  result: PileCapResult;
}

export function PileCapResults({ inp, result }: Props) {
  const n       = inp.n as number;
  const phi_tie = inp.phi_tie as number;

  if (!result.valid && result.error) {
    return (
      <div className="rounded border border-state-fail/40 px-4 py-3 m-2">
        <p className="text-[12px] text-state-fail">{result.error}</p>
      </div>
    );
  }

  const status = overallStatus(result.checks);

  const borderCls =
    status === 'ok'   ? 'border-state-ok/40'   :
    status === 'warn' ? 'border-state-warn/40'  :
    status === 'fail' ? 'border-state-fail/40'  :
                        'border-state-neutral/40';

  return (
    <div className={`flex flex-col rounded border-2 px-4 py-3 m-2 transition-colors ${borderCls}`}>

      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-border-main">
        <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-text-secondary">
          Encepado de micropilotes
        </span>
        <VerdictBadge status={status} />
      </div>

      {/* Reacciones */}
      <GroupHeader label="Reacciones Navier" />
      {result.reactions.map((R, i) => (
        <ValueRow
          key={`R${i}`}
          label={`R${i + 1}`}
          value={`${R.toFixed(1)} kN`}
        />
      ))}
      <ValueRow label="R_max" value={`${result.R_max.toFixed(1)} kN`} />
      <ValueRow label="R_min" value={`${result.R_min.toFixed(1)} kN`} />

      {/* Geometría del encepado */}
      <GroupHeader label="Geometría del encepado" />
      <ValueRow label="Lx × Ly"  value={`${result.L_x.toFixed(0)} × ${result.L_y.toFixed(0)} mm`} />
      <ValueRow label="e_borde"  value={`${result.e_borde.toFixed(0)} mm`} />
      <ValueRow label="h_min"    value={`${result.h_min.toFixed(0)} mm`} />

      {/* Bielas y tirantes */}
      <GroupHeader label="Bielas y tirantes" />
      <ValueRow label="z_eff"      value={`${result.z_eff.toFixed(0)} mm`} />
      <ValueRow label="a_crit"     value={`${result.a_crit.toFixed(0)} mm`} />
      <ValueRow label="θ (biela)"  value={`${result.theta_deg.toFixed(1)}°`} />
      <ValueRow label="σ_biela"    value={`${result.sigma_strut.toFixed(2)} MPa`} />
      <ValueRow label="σ_Rd,max"   value={`${result.sigma_Rd_max.toFixed(2)} MPa`} />
      <ValueRow label="Ft,x"       value={`${result.Ft_x.toFixed(1)} kN`} />
      {result.Ft_y !== null && (
        <ValueRow label="Ft,y" value={`${result.Ft_y.toFixed(1)} kN`} />
      )}

      {/* Armadura tirantes */}
      <GroupHeader label="Armadura de tirantes" />
      <ValueRow label={resultLabel('As_req_x')}     value={`${result.As_tie_x.toFixed(0)} mm²`} />
      <ValueRow label={resultLabel('As_min_x')}     value={`${result.As_min_x.toFixed(0)} mm²`} />
      <ValueRow label={resultLabel('As_adopted_x')} value={`${result.As_adopted_x.toFixed(0)} mm²`} />
      <div className="flex items-center justify-between py-1.75 border-b border-border-sub">
        <span className="text-[12px] text-text-secondary">Barras x</span>
        <span className="text-[11px] font-mono text-accent tabular-nums font-semibold">
          {`${result.n_bars_x} Ø${phi_tie} → ${result.As_prov_x.toFixed(0)} mm²`}
        </span>
      </div>

      {n === 4 && result.n_bars_y !== null && result.As_min_y !== null &&
        result.As_adopted_y !== null && result.As_prov_y !== null && (
        <>
          <ValueRow label={resultLabel('As_req_y')}     value={`${result.As_tie_y?.toFixed(0)} mm²`} />
          <ValueRow label={resultLabel('As_min_y')}     value={`${result.As_min_y.toFixed(0)} mm²`} />
          <ValueRow label={resultLabel('As_adopted_y')} value={`${result.As_adopted_y.toFixed(0)} mm²`} />
          <div className="flex items-center justify-between py-1.75 border-b border-border-sub">
            <span className="text-[12px] text-text-secondary">Barras y</span>
            <span className="text-[11px] font-mono text-accent tabular-nums font-semibold">
              {`${result.n_bars_y} Ø${phi_tie} → ${result.As_prov_y.toFixed(0)} mm²`}
            </span>
          </div>
        </>
      )}

      <ValueRow label="sep_max" value={`${result.s_max.toFixed(0)} mm`} />
      <ValueRow label="s_bar,x" value={`${result.s_bar_x.toFixed(0)} mm`} />
      {result.s_bar_y !== null && (
        <ValueRow label="s_bar,y" value={`${result.s_bar_y.toFixed(0)} mm`} />
      )}

      {/* Anclaje */}
      <GroupHeader label="Anclaje (CE art. 69)" />
      <ValueRow label="lb,básica" value={`${result.lb.toFixed(0)} mm`} />
      <ValueRow label="lb,neta"   value={`${result.lb_net.toFixed(0)} mm`} />
      <ValueRow label="lb,disp"   value={`${result.lb_avail.toFixed(0)} mm`} />

      {/* Verificaciones */}
      <GroupHeader label="Verificaciones CE / CTE" />
      {result.checks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {n === 3 && (
        <p className="text-[10px] text-text-secondary mt-2 leading-relaxed">
          Nota n=3: Ft calculado conservadoramente como R_max·a_crit/z_eff (~15% sobre el valor exacto).
          CE art. 48 / EHE-08 art. 58.
        </p>
      )}
    </div>
  );
}
