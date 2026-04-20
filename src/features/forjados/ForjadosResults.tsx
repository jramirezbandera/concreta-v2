import { type ForjadosResult } from '../../lib/calculations/rcSlabs';
import {
  VerdictBadge, CheckRowItem, GroupHeader, ValueRow, overallStatus, ambientStyle,
} from '../../components/checks';

interface Props {
  result: ForjadosResult;
}

const BRANCH_LABEL: Record<string, string> = {
  'rect-bEff': 'Rectangular b_eff (ala no plastifica)',
  't-real':    'T real (ala + nervio)',
  'rect-bw':   'Rectangular b_w (nervio comp.)',
  'rect':      'Rectangular',
};

export function ForjadosResults({ result }: Props) {
  if (!result.valid && result.error) {
    return (
      <div className="flex flex-col overflow-y-auto px-4 py-3">
        <div className="rounded border border-state-fail/40 px-4 py-3">
          <p className="text-[12px] text-state-fail">{result.error}</p>
        </div>
      </div>
    );
  }

  const allChecks = [
    ...result.vano.checks,
    ...result.apoyo.checks,
    ...result.shearChecks,
  ];
  const status = overallStatus(allChecks);
  const isReticular = result.variant === 'reticular';

  return (
    <div
      className="flex flex-col overflow-y-auto rounded px-4 py-3 m-2 transition-colors"
      style={ambientStyle(status)}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-border-main">
        <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-text-secondary">
          {isReticular ? 'Forjado reticular' : 'Losa maciza'}
        </span>
        <VerdictBadge status={status} />
      </div>

      {/* Parámetros globales */}
      {isReticular && (
        <>
          <GroupHeader label="Parámetros (CE art. 21)" />
          <ValueRow label="L0 (longitud equivalente)" value={`${result.L0.toFixed(0)} mm`} />
          <ValueRow label="b_eff (ancho eficaz)"      value={`${result.bEff.toFixed(0)} mm`} />
        </>
      )}

      {/* VANO */}
      <GroupHeader label="Vano (M+)" />
      <ValueRow label="b flexión"      value={`${result.vano.b.toFixed(0)} mm`} />
      <ValueRow label="d (canto útil)" value={`${result.vano.d.toFixed(0)} mm`} />
      <ValueRow label="As base"        value={`${result.vano.AsBase.toFixed(0)} mm²${isReticular ? '' : '/m'}`} />
      <ValueRow label="As refuerzo"    value={`${result.vano.AsRef.toFixed(0)} mm²${isReticular ? '' : '/m'}`} />
      <ValueRow label="As tracción (total)" value={`${result.vano.As.toFixed(0)} mm²${isReticular ? '' : '/m'}`} />
      <ValueRow label="x (fibra neutra)" value={`${result.vano.x.toFixed(1)} mm`} />
      <ValueRow label="MRd"              value={`${result.vano.MRd.toFixed(2)} kNm`} />
      <ValueRow label="Rama"             value={BRANCH_LABEL[result.vano.branch] ?? result.vano.branch} />
      {result.vano.checks.map((c) => <CheckRowItem key={`v-${c.id}`} check={c} />)}

      {/* APOYO */}
      <GroupHeader label="Apoyo (M−)" />
      <ValueRow label="b flexión"      value={`${result.apoyo.b.toFixed(0)} mm`} />
      <ValueRow label="d (canto útil)" value={`${result.apoyo.d.toFixed(0)} mm`} />
      <ValueRow label="As base"        value={`${result.apoyo.AsBase.toFixed(0)} mm²${isReticular ? '' : '/m'}`} />
      <ValueRow label="As refuerzo"    value={`${result.apoyo.AsRef.toFixed(0)} mm²${isReticular ? '' : '/m'}`} />
      <ValueRow label="As tracción (total)" value={`${result.apoyo.As.toFixed(0)} mm²${isReticular ? '' : '/m'}`} />
      <ValueRow label="x (fibra neutra)" value={`${result.apoyo.x.toFixed(1)} mm`} />
      <ValueRow label="MRd"              value={`${result.apoyo.MRd.toFixed(2)} kNm`} />
      <ValueRow label="Rama"             value={BRANCH_LABEL[result.apoyo.branch] ?? result.apoyo.branch} />
      {result.apoyo.checks.map((c) => <CheckRowItem key={`a-${c.id}`} check={c} />)}

      {/* CORTANTE */}
      <GroupHeader label="Cortante (CE art. 44)" />
      <ValueRow label="VRd,c (sin cercos)" value={`${result.VRdc.toFixed(2)} kN`} />
      <div
        className="overflow-hidden transition-all duration-150"
        style={{
          maxHeight: result.VRds > 0 ? '120px' : '0px',
          opacity:   result.VRds > 0 ? 1 : 0,
        }}
      >
        <ValueRow label="VRd,s (cercos)"      value={`${result.VRds.toFixed(2)} kN`} />
        <ValueRow label="VRd,max (aplast.)"   value={`${result.VRdmax.toFixed(2)} kN`} />
        <ValueRow label="VRd (min VRd,s/max)" value={`${result.VRd.toFixed(2)} kN`} />
      </div>
      {result.shearChecks.map((c) => <CheckRowItem key={`s-${c.id}`} check={c} />)}

      {/* INFO */}
      {result.infoChecks.length > 0 && (
        <>
          <GroupHeader label="Información (no bloqueante)" />
          {result.infoChecks.map((c) => <CheckRowItem key={`i-${c.id}`} check={c} />)}
        </>
      )}
    </div>
  );
}
