import { type CompositeSectionResult } from '../../lib/calculations/compositeSection';
import { CheckRowItem, GroupHeader, ValueRow, ambientStyle } from '../../components/checks';
import { type CheckStatus } from '../../lib/calculations/types';
import { resultLabel } from '../../lib/text/labels';

interface Props {
  result: CompositeSectionResult;
}

// ── Custom badge for section class ────────────────────────────────────────────

function ClassBadge({ sectionClass }: { sectionClass: 1 | 2 | 3 | 4 | null }) {
  let cls = '';
  let label = '';
  if (sectionClass === null) {
    cls   = 'bg-state-neutral/10 text-state-neutral';
    label = 'N/A';
  } else if (sectionClass <= 2) {
    cls   = 'bg-state-ok/10 text-state-ok';
    label = `CLASE ${sectionClass}`;
  } else if (sectionClass === 3) {
    cls   = 'bg-state-warn/10 text-state-warn';
    label = 'CLASE 3';
  } else {
    cls   = 'bg-state-fail/10 text-state-fail';
    label = 'CLASE 4';
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold px-1.25 py-0.5 rounded tracking-[0.02em] ${cls}`}
      role="status"
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} aria-hidden="true" />
      {label}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CompositeSectionResults({ result }: Props) {
  if (!result.valid && result.error) {
    return (
      <div className="flex flex-col overflow-y-auto px-4 py-3">
        <div className="rounded border border-state-fail/40 px-4 py-3">
          <p className="text-[12px] text-state-fail">{result.error}</p>
        </div>
      </div>
    );
  }

  const { sectionClass } = result;
  const isClass4 = sectionClass === 4;
  const mrdFormula = isClass4
    ? 'Weff · fy / γM0 (EN 1993-1-5)'
    : (sectionClass === null || sectionClass <= 2)
      ? 'Wpl · fy / γM0'
      : 'Wel · fy / γM0';

  const ambientStatus: CheckStatus =
    sectionClass === null ? 'ok' :
    sectionClass <= 2     ? 'ok' :
    sectionClass === 3    ? 'warn' : 'fail';

  return (
    <div
      className="flex flex-col rounded px-4 py-3 m-2 transition-colors"
      style={ambientStyle(ambientStatus)}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-border-main">
        <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-text-secondary">
          Sección compuesta
        </span>
        <ClassBadge sectionClass={sectionClass} />
      </div>

      {/* Propiedades compuestas */}
      <GroupHeader label="Propiedades compuestas" />
      <ValueRow label="A total"          value={`${result.A_cm2.toFixed(1)} cm²`} />
      <ValueRow label="y_c (desde abajo)" value={`${result.yc_mm.toFixed(1)} mm`} />
      <ValueRow label="Iy"               value={`${result.Iy_cm4.toFixed(0)} cm⁴`} />
      <ValueRow label="Wel,sup"          value={`${result.Wel_top_cm3.toFixed(0)} cm³`} />
      <ValueRow label="Wel,inf"          value={`${result.Wel_bot_cm3.toFixed(0)} cm³`} />
      <div className="flex items-center justify-between py-1.75 border-b border-border-sub last:border-b-0">
        <span className="text-[12px] text-text-secondary">Wel,min</span>
        <span className="text-[11px] font-mono text-accent tabular-nums font-semibold">
          {result.Wel_min_cm3.toFixed(0)} cm³
        </span>
      </div>
      <ValueRow label="Wpl"              value={`${result.Wpl_cm3.toFixed(0)} cm³`} />
      <ValueRow label="α (Wpl / Wel,min)" value={result.shapeFactor.toFixed(3)} />

      {/* Clasificación — only in reinforced mode */}
      {sectionClass !== null && result.checks.length > 0 && (
        <>
          <GroupHeader label="Clasificación CE art. 5.2" />
          {result.checks.map((c) => <CheckRowItem key={c.id} check={c} />)}
        </>
      )}

      {/* Momento resistente */}
      <GroupHeader label="Momento resistente" />
      <div className="flex items-center justify-between py-0.75">
        <span className="text-[11px] font-mono text-text-disabled">{mrdFormula}</span>
      </div>
      <div className="flex items-center justify-between py-1.75 border-b border-border-sub">
        <span className="text-[12px] text-text-secondary">MRd</span>
        {isClass4 ? (
          <span className="text-[12px] font-mono text-state-fail tabular-nums font-semibold">N/D</span>
        ) : (
          <span className="text-[13px] font-mono text-text-primary tabular-nums font-semibold">
            {result.Mrd_kNm.toFixed(1)} kNm
          </span>
        )}
      </div>
      <ValueRow label={resultLabel('fy_steel')} value={`${result.fy_MPa} MPa`} />
      <ValueRow label={resultLabel('gamma_M0')} value="1.05" />

      {isClass4 && (
        <p className="text-[10px] text-state-fail mt-2">
          Clase 4 — pandeo local. MRd no disponible (requiere sección eficaz per EN 1993-1-5).
        </p>
      )}
    </div>
  );
}
