import { type PileCapInputs } from '../../data/defaults';
import { type PileCapResult } from '../../lib/calculations/pileCap';
import { CheckRowItem, GroupHeader, ValueRow, VerdictBadge, overallStatus, ambientStyle } from '../../components/checks';
import { resultLabel } from '../../lib/text/labels';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { dec, formatQuantity } from '../../lib/units/format';
import type { Quantity } from '../../lib/units/types';

interface Props {
  inp:    PileCapInputs;
  result: PileCapResult;
}

export function PileCapResults({ inp, result }: Props) {
  const n       = inp.n as number;
  const phi_tie = inp.phi_tie as number;
  const { system } = useUnitSystem();
  const fmtSi = (v: number, q: Quantity, precision = 1) =>
    formatQuantity(v, q, system, { precision });

  if (!result.valid && result.error) {
    return (
      <div className="rounded border border-state-fail/40 px-4 py-3 m-2">
        <p className="text-[12px] text-state-fail">{result.error}</p>
      </div>
    );
  }

  const status = overallStatus(result.checks);

  return (
    <div className="flex flex-col rounded px-4 py-3 m-2 transition-colors" style={ambientStyle(status)}>

      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-border-main">
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">
          Resultados calculados
        </span>
        <VerdictBadge status={status} />
      </div>

      {/* Reacciones */}
      <GroupHeader label="Reacciones Navier" />
      {result.reactions.map((R, i) => (
        <ValueRow
          key={`R${i}`}
          label={`R${i + 1}`}
          value={fmtSi(R, 'force')}
        />
      ))}
      <ValueRow label="R_max" value={fmtSi(result.R_max, 'force')} />
      <ValueRow label="R_min" value={fmtSi(result.R_min, 'force')} />

      {/* Geometría del encepado */}
      <GroupHeader label="Geometría del encepado" />
      {n === 3 ? (
        <>
          <ValueRow label="Planta"     value="triangular, chaflanes a e" />
          <ValueRow label="Envolvente" value={`${result.L_x.toFixed(0)} × ${result.L_y.toFixed(0)} mm`} />
        </>
      ) : (
        <ValueRow label="Lx × Ly"  value={`${result.L_x.toFixed(0)} × ${result.L_y.toFixed(0)} mm`} />
      )}
      <ValueRow label="e_borde"  value={`${result.e_borde.toFixed(0)} mm`} />
      <ValueRow label="A_planta" value={`${(result.A_cap / 1e6).toFixed(2)} m²`} />
      <ValueRow label="h_min"    value={`${result.h_min.toFixed(0)} mm`} />

      {/* Bielas y tirantes */}
      <GroupHeader label="Bielas y tirantes" />
      <ValueRow label="z_eff"      value={`${result.z_eff.toFixed(0)} mm`} />
      <ValueRow label="a_crit"     value={`${result.a_crit.toFixed(0)} mm`} />
      <ValueRow label="θ (biela)"  value={`${dec(result.theta_deg, 1)}°`} />
      <ValueRow
        label="Apoyo nodo"
        value={inp.plate_on
          ? `placa ${inp.plate_shape === 'cuad' ? '□' : 'Ø'}${(inp.d_plate as number).toFixed(0)} → ${result.A_node.toFixed(0)} mm²`
          : `micro Ø${(inp.d_p as number).toFixed(0)} → ${result.A_node.toFixed(0)} mm²`}
      />
      <ValueRow label="σ_biela"    value={fmtSi(result.sigma_strut, 'stress')} />
      <ValueRow label="σ_Rd,max"   value={fmtSi(result.sigma_Rd_max, 'stress')} />
      <ValueRow label="fyd tirante" value={`${fmtSi(result.fyd, 'stress', 0)} (≤ 400, EHE-08 40.2)`} />
      <ValueRow label="Ft,x"       value={fmtSi(result.Ft_x, 'force')} />
      {result.Ft_y !== null && (
        <ValueRow label="Ft,y" value={fmtSi(result.Ft_y, 'force')} />
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

      {n >= 4 && result.n_bars_y !== null && result.As_min_y !== null &&
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

      {/* Armadura secundaria dispuesta vs requerida — EHE-08 art. 58.4.1.2
        * (el CE no fija mínimos propios): 2 pilotes → 58.4.1.2.1.2; 3 y 4 →
        * 58.4.1.2.2. Lo no exigido para ese n se informa sin «req.». */}
      <GroupHeader label={n === 2 ? 'Armadura secundaria (EHE-08 58.4.1.2.1.2)' : 'Armadura secundaria (EHE-08 58.4.1.2.2)'} />
      {n === 2 ? (
        <>
          <ValueRow label="b_ref (4‰)" value={`${result.b_ref.toFixed(0)} mm`} />
          <ValueRow label="Superior" value={`${inp.n_top as number}Ø${inp.phi_top as number} → ${result.As_top_prov.toFixed(0)} mm² (req. ${result.As_top_req.toFixed(0)})`} />
          <ValueRow label="Cercos vert." value={`Ø${inp.phi_cv as number} c/${inp.s_cv as number} ×${inp.n_cv as number} → ${result.As_cv_prov.toFixed(0)} mm²/m (req. ${result.As_cv_req.toFixed(0)})`} />
          <ValueRow label="Horiz. caras" value={`Ø${inp.phi_ch as number} c/${inp.s_ch as number} → ${result.As_ch_prov.toFixed(0)} mm²/m (req. ${result.As_ch_req.toFixed(0)})`} />
        </>
      ) : (
        <>
          <ValueRow label="Retícula inf." value={`Ø${inp.phi_g as number} c/${inp.s_g as number} → ${result.As_g_prov.toFixed(0)} mm²/m (req. ${result.As_g_req.toFixed(0)})`} />
          <ValueRow label="Cercos banda" value={`Ø${inp.phi_cv as number} c/${inp.s_cv as number} ×${inp.n_cv as number} → ${result.As_cv_prov.toFixed(0)} mm²/m (req. ${result.As_cv_req.toFixed(0)})`} />
          <ValueRow label="Cercos total" value={`${result.As_cv_tot_prov.toFixed(0)} mm² en ${(result.L_bands / 1000).toFixed(2)} m (req. ${result.As_cv_tot_req.toFixed(0)})`} />
          <ValueRow label="Superior" value={`${inp.n_top as number}Ø${inp.phi_top as number} → ${result.As_top_prov.toFixed(0)} mm² (no exigida)`} />
          <ValueRow label="Horiz. caras" value={`Ø${inp.phi_ch as number} c/${inp.s_ch as number} → ${result.As_ch_prov.toFixed(0)} mm²/m (no exigida)`} />
        </>
      )}

      {/* Anclaje */}
      <GroupHeader label="Anclaje (CE Anejo 19 §8.4.4)" />
      <ValueRow label="lb,básica" value={`${result.lb.toFixed(0)} mm`} />
      <ValueRow label="lb,req"     value={`${result.lb_net.toFixed(0)} mm`} />
      <ValueRow label="lb,disp"   value={`${result.lb_avail.toFixed(0)} mm`} />

      {/* Verificaciones */}
      <GroupHeader label="Verificaciones CE / CTE" />
      {result.checks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {n === 3 && (
        <p className="text-[10px] text-text-secondary mt-2 leading-relaxed">
          Nota n=3: encepado rígido de tres pilotes (Calavera fig. 14-9). Planta triangular con
          las esquinas achaflanadas a e del eje de cada pilote; tirantes en banda sobre los tres
          lados, T = 0,68·R_max/d·(0,58·s − 0,25·a) por lado. CE Anejo 19 §6.5.
        </p>
      )}
    </div>
  );
}
