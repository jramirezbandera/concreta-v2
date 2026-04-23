import { type IsolatedFootingInputs } from '../../data/defaults';
import {
  type IsolatedFootingResult,
  type DistributionType,
} from '../../lib/calculations/isolatedFooting';
import {
  CheckRowItem, GroupHeader, ValueRow, VerdictBadge,
  overallStatus, ambientStyle,
} from '../../components/checks';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { formatQuantity } from '../../lib/units/format';
import type { Quantity } from '../../lib/units/types';

interface Props {
  inp:    IsolatedFootingInputs;
  result: IsolatedFootingResult;
}

const FS_MIN = 1.5;

const DIST_LABEL: Record<DistributionType, string> = {
  trapezoidal:           'Trapecial',
  bitriangular_uniaxial: 'Bitri uniaxial',
  bitriangular_biaxial:  'Bitri biaxial',
  overturning_fail:      'Vuelco geométrico',
};

const DIST_CLASSES: Record<DistributionType, string> = {
  trapezoidal:           'bg-state-ok/10 text-state-ok',
  bitriangular_uniaxial: 'bg-state-warn/10 text-state-warn',
  bitriangular_biaxial:  'bg-state-warn/10 text-state-warn',
  overturning_fail:      'bg-state-fail/10 text-state-fail',
};

function DistributionBadge({ type }: { type: DistributionType }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold px-1.75 py-0.5 rounded tracking-[0.05em] ${DIST_CLASSES[type]}`}
      role="status"
      aria-label={`Distribución de presiones: ${DIST_LABEL[type]}`}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} aria-hidden="true" />
      {DIST_LABEL[type]}
    </span>
  );
}

// FS row with status symbol (✓/⚠/✗ or ∞ — vuelco)
function FSRow({
  label, fs, isFail,
}: {
  label: string;
  fs: number;
  isFail: boolean;
}) {
  if (isFail) {
    return (
      <div className="flex items-center justify-between py-1.75 border-b border-border-sub">
        <span className="text-[12px] text-text-secondary">{label}</span>
        <span className="text-[11px] font-mono text-state-fail tabular-nums">∞ — vuelco geom</span>
      </div>
    );
  }
  const status: 'ok' | 'warn' | 'fail' =
    fs >= FS_MIN ? 'ok' : fs >= FS_MIN * 0.95 ? 'warn' : 'fail';
  const sym = status === 'ok' ? '✓' : status === 'warn' ? '⚠' : '✗';
  const colorClass =
    status === 'ok' ? 'text-state-ok' : status === 'warn' ? 'text-state-warn' : 'text-state-fail';
  return (
    <div className="flex items-center justify-between py-1.75 border-b border-border-sub">
      <span className="text-[12px] text-text-secondary">{label}</span>
      <span className="text-[11px] font-mono text-text-primary tabular-nums">
        {fs.toFixed(2)}
        <span className="text-text-disabled ml-2">(≥{FS_MIN.toFixed(1)})</span>
        <span className={`ml-2 ${colorClass}`}>{sym}</span>
      </span>
    </div>
  );
}

export function IsolatedFootingResults({ result }: Props) {
  const { system } = useUnitSystem();
  const fmtSi = (v: number, q: Quantity) => formatQuantity(v, q, system);

  if (!result.valid && result.error) {
    return (
      <div className="rounded border border-state-fail/40 px-4 py-3 m-2">
        <p className="text-[12px] text-state-fail">{result.error}</p>
      </div>
    );
  }

  const dist = result.distributionType;
  const isFail = dist === 'overturning_fail';
  const isBitri = dist === 'bitriangular_uniaxial' || dist === 'bitriangular_biaxial';
  const status = overallStatus(result.checks);

  // ex/ey vs core thirds (B/6, L/6)
  const ex_ratio = result.ex_over_B6;
  const ey_ratio = result.ey_over_L6;

  // σmin display per distribution type
  let sigmaMinValue: string;
  let sigmaMinSuffix: string | null = null;
  if (isFail) {
    sigmaMinValue = '—';
  } else if (isBitri) {
    sigmaMinValue = '0';
    sigmaMinSuffix = 'despegue parcial';
  } else {
    sigmaMinValue = fmtSi(result.sigma_min, 'soilPressure');
  }

  // loaded_area_fraction display
  const loadedFracPct = (result.loaded_area_fraction * 100).toFixed(0);

  return (
    <div className="flex flex-col rounded px-4 py-3 m-2 transition-colors" style={ambientStyle(status)}>

      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-border-main">
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">
          Resultados calculados
        </span>
        <VerdictBadge status={status} />
      </div>

      {/* 1. Distribución */}
      <div className="flex items-center justify-between py-1.75 border-b border-border-sub">
        <span className="text-[12px] text-text-secondary">Distribución</span>
        <DistributionBadge type={dist} />
      </div>
      <div className="py-1 border-b border-border-sub">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-mono text-text-secondary tabular-nums">
            {`ex = ${result.ex_sls.toFixed(3)} m`}
            <span className="text-text-disabled ml-2">{`(ex/(B/6) = ${ex_ratio.toFixed(2)})`}</span>
          </span>
          <span className={`font-mono text-[11px] ${ex_ratio > 1 ? 'text-accent' : 'text-state-ok'}`}>
            {ex_ratio > 1 ? '▲' : '✓'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-mono text-text-secondary tabular-nums">
            {`ey = ${result.ey_sls.toFixed(3)} m`}
            <span className="text-text-disabled ml-2">{`(ey/(L/6) = ${ey_ratio.toFixed(2)})`}</span>
          </span>
          <span className={`font-mono text-[11px] ${ey_ratio > 1 ? 'text-accent' : 'text-state-ok'}`}>
            {ey_ratio > 1 ? '▲' : '✓'}
          </span>
        </div>
      </div>

      {/* 2. Cargas derivadas (2 columnas SLS | ELU) */}
      <GroupHeader label="Cargas derivadas" />
      <div className="grid grid-cols-2 gap-x-4">
        <div>
          <p className="text-[10px] text-text-disabled mb-1 font-semibold">SLS (suelo)</p>
          <ValueRow label="N_sls"  value={fmtSi(result.N_sls,  'force')} />
          <ValueRow label="Mx_sls" value={fmtSi(result.Mx_sls, 'moment')} />
          <ValueRow label="My_sls" value={fmtSi(result.My_sls, 'moment')} />
          <ValueRow label="H_sls"  value={fmtSi(result.H_sls,  'force')} />
        </div>
        <div>
          <p className="text-[10px] text-text-disabled mb-1 font-semibold">ELU (armado)</p>
          <ValueRow label="N_elu"  value={fmtSi(result.N_elu,  'force')} />
          <ValueRow label="Mx_elu" value={fmtSi(result.Mx_elu, 'moment')} />
          <ValueRow label="My_elu" value={fmtSi(result.My_elu, 'moment')} />
          <ValueRow label="H_elu"  value={fmtSi(result.H_elu,  'force')} />
        </div>
      </div>

      {/* 3. Tensiones (3 filas físicas siempre — evita layout shifts) */}
      <GroupHeader label="Tensiones" />
      <div className="flex items-center justify-between py-1.75 border-b border-border-sub">
        <span className="text-[12px] text-text-secondary">σmax</span>
        <span className={`text-[11px] font-mono tabular-nums ${isFail ? 'text-state-fail' : 'text-text-primary'}`}>
          {isFail ? '∞' : fmtSi(result.sigma_max, 'soilPressure')}
        </span>
      </div>
      <div className="flex items-center justify-between py-1.75 border-b border-border-sub">
        <span className="text-[12px] text-text-secondary">σmin</span>
        <span className="text-[11px] font-mono text-text-primary tabular-nums">
          {sigmaMinValue}
          {sigmaMinSuffix && (
            <span className="text-[10px] text-text-disabled ml-2">— {sigmaMinSuffix}</span>
          )}
        </span>
      </div>
      <div className="flex items-center justify-between py-1.75 border-b border-border-sub">
        <span className="text-[12px] text-text-secondary">Área cargada</span>
        <span className="text-[11px] font-mono text-text-primary tabular-nums">
          {dist === 'trapezoidal' ? (
            <span>&nbsp;</span>
          ) : isFail ? (
            <span className="text-state-fail">0 % — vuelco</span>
          ) : (
            <>{`${loadedFracPct} %`}<span className="text-[10px] text-text-disabled ml-2">— compresión</span></>
          )}
        </span>
      </div>

      {/* 4. Estabilidad */}
      <GroupHeader label="Estabilidad" />
      <FSRow label="FS_vuelco_x" fs={result.FS_overturn_x} isFail={isFail} />
      <FSRow label="FS_vuelco_y" fs={result.FS_overturn_y} isFail={isFail} />
      <FSRow label="FS_desliz"   fs={result.FS_sliding}    isFail={false /* sliding is independent of overturning */} />

      {/* 5. Verificaciones */}
      <GroupHeader label="Verificaciones CE / CTE" />
      {result.checks.map((c) => <CheckRowItem key={c.id} check={c} />)}
    </div>
  );
}
