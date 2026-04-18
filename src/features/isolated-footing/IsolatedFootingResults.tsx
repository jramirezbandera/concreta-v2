import { type IsolatedFootingInputs } from '../../data/defaults';
import { type IsolatedFootingResult } from '../../lib/calculations/isolatedFooting';
import { CheckRowItem, GroupHeader, ValueRow, VerdictBadge, overallStatus, ambientStyle } from '../../components/checks';
import { resultLabel } from '../../lib/text/labels';

interface Props {
  inp:    IsolatedFootingInputs;
  result: IsolatedFootingResult;
}

export function IsolatedFootingResults({ inp, result }: Props) {
  const soilType = inp.soilType as string;
  const phi_x    = inp.phi_x   as number;
  const phi_y    = inp.phi_y   as number;
  const s_x      = inp.s_x     as number;
  const s_y      = inp.s_y     as number;
  const H_k      = inp.H_k     as number;

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
        <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-text-secondary">
          Zapata aislada
        </span>
        <VerdictBadge status={status} />
      </div>

      {/* Geometría efectiva */}
      <GroupHeader label="Geometría efectiva (Meyerhof)" />
      <ValueRow label="ex"    value={`${(result.ex * 1000).toFixed(0)} mm`} />
      <ValueRow label="ey"    value={`${(result.ey * 1000).toFixed(0)} mm`} />
      <ValueRow label="B'"    value={`${result.B_eff.toFixed(3)} m`} />
      <ValueRow label="L'"    value={`${result.L_eff.toFixed(3)} m`} />

      {/* Presión del terreno (SLS) */}
      <GroupHeader label="Presión terreno (SLS)" />
      <ValueRow label="σmax"  value={`${result.sigma_max.toFixed(1)} kPa`} />
      <ValueRow label="σmin"  value={`${result.sigma_min.toFixed(1)} kPa`} />
      <ValueRow label="σ_eff" value={`${result.sigma_eff.toFixed(1)} kPa`} />
      {soilType === 'cohesive' && (
        <ValueRow label="qh"  value={`${result.qh.toFixed(1)} kPa`} />
      )}
      <ValueRow label="qadm"  value={`${result.qadm.toFixed(1)} kPa`} />
      {H_k > 0 && (
        <ValueRow label="Rd,desliz" value={`${result.Rd_slide.toFixed(1)} kN`} />
      )}

      {/* ELU structural */}
      <GroupHeader label="Armado (ELU)" />
      <ValueRow label="σ_Ed"   value={`${result.sigma_Ed.toFixed(1)} kPa`} />
      <ValueRow label="d_x"    value={`${result.d_x.toFixed(0)} mm`} />
      <ValueRow label="d_y"    value={`${result.d_y.toFixed(0)} mm`} />
      <ValueRow label="ax"     value={`${(result.ax / 1000).toFixed(3)} m`} />
      <ValueRow label="ay"     value={`${(result.ay / 1000).toFixed(3)} m`} />
      <ValueRow
        label="Clasificación"
        value={`${result.is_rigid ? 'Rígida' : 'Flexible'} — v/h=${(Math.max(result.v_max_x, result.v_max_y) / (inp.h as number)).toFixed(2)}`}
      />
      {result.is_rigid ? (
        <>
          <ValueRow label="Td,x" value={`${result.Td_x.toFixed(1)} kN (biela-tirante)`} />
          <ValueRow label="Td,y" value={`${result.Td_y.toFixed(1)} kN (biela-tirante)`} />
        </>
      ) : (
        <>
          <ValueRow label="MEd,x"  value={`${result.MEd_x.toFixed(2)} kNm/m`} />
          <ValueRow label="MEd,y"  value={`${result.MEd_y.toFixed(2)} kNm/m`} />
        </>
      )}

      {/* Armadura x */}
      <GroupHeader label="Armadura dir. x" />
      <ValueRow label={resultLabel('As_req_x')}     value={`${result.As_req_x.toFixed(0)} mm²/m`} />
      <ValueRow label={resultLabel('As_min_x')}     value={`${result.As_min_x.toFixed(0)} mm²/m`} />
      <ValueRow label={resultLabel('As_adopted_x')} value={`${result.As_adopted_x.toFixed(0)} mm²/m`} />
      <div className="flex items-center justify-between py-1.75 border-b border-border-sub">
        <span className="text-[12px] text-text-secondary">Barras x</span>
        <span className="text-[11px] font-mono text-accent tabular-nums font-semibold">
          {`Ø${phi_x}@${s_x} → ${result.As_prov_x.toFixed(0)} mm²/m`}
        </span>
      </div>

      {/* Armadura y */}
      <GroupHeader label="Armadura dir. y" />
      <ValueRow label={resultLabel('As_req_y')}     value={`${result.As_req_y.toFixed(0)} mm²/m`} />
      <ValueRow label={resultLabel('As_min_y')}     value={`${result.As_min_y.toFixed(0)} mm²/m`} />
      <ValueRow label={resultLabel('As_adopted_y')} value={`${result.As_adopted_y.toFixed(0)} mm²/m`} />
      <div className="flex items-center justify-between py-1.75 border-b border-border-sub">
        <span className="text-[12px] text-text-secondary">Barras y</span>
        <span className="text-[11px] font-mono text-accent tabular-nums font-semibold">
          {`Ø${phi_y}@${s_y} → ${result.As_prov_y.toFixed(0)} mm²/m`}
        </span>
      </div>

      {/* Cortante */}
      <GroupHeader label="Cortante (CE art. 44)" />
      {result.ell_x > 0 ? (
        <ValueRow label="VEd,x" value={`${result.VEd_x.toFixed(1)} kN/m`} />
      ) : (
        <ValueRow label="Cortante x" value="N/A (pilar ≥ d)" />
      )}
      {result.ell_y > 0 ? (
        <ValueRow label="VEd,y" value={`${result.VEd_y.toFixed(1)} kN/m`} />
      ) : (
        <ValueRow label="Cortante y" value="N/A (pilar ≥ d)" />
      )}
      <ValueRow label="vRd,c"  value={`${result.vRdc.toFixed(3)} MPa`} />

      {/* Punzonamiento — only for flexible footings. Rigid footings transfer
          load through compression struts and don't punch (CE art. 55.2). */}
      {result.is_rigid ? (
        <>
          <GroupHeader label="Punzonamiento" />
          <ValueRow label="Punzonamiento" value="N/A — zapata rígida" />
        </>
      ) : (
        <>
          <GroupHeader label="Punzonamiento (CE art. 46)" />
          <ValueRow label="d_avg"  value={`${result.d_avg.toFixed(0)} mm`} />
          <ValueRow label="u1"     value={`${result.u1.toFixed(0)} mm`} />
          <ValueRow label="vEd"    value={`${result.vEd_punch.toFixed(3)} MPa`} />
          <ValueRow label="vRd,c"  value={`${result.vRdc_punch.toFixed(3)} MPa`} />
        </>
      )}

      {/* Verificaciones */}
      <GroupHeader label="Verificaciones CE / CTE" />
      {result.checks.map((c) => <CheckRowItem key={c.id} check={c} />)}
    </div>
  );
}
