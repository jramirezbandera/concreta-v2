import { type RCBeamResult, type RCBeamSectionResult } from '../../lib/calculations/rcBeams';
import { VerdictBadge, CheckRowItem, GroupHeader, ValueRow, BORDER_CLASSES, overallStatus, ambientStyle } from '../../components/checks';
import { resultLabel } from '../../lib/text/labels';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { formatQuantity } from '../../lib/units/format';
import type { Quantity } from '../../lib/units/types';

interface RCBeamsResultsProps {
  result: RCBeamResult;
  activeSection: 'vano' | 'apoyo';
}

function SectionBlock({
  title,
  section,
  isActive,
  fmtSi,
}: {
  title: string;
  section: RCBeamSectionResult;
  isActive: boolean;
  fmtSi: (v: number, q: Quantity) => string;
}) {
  if (!section.valid) {
    return (
      <div className={`rounded border px-4 py-3 ${isActive ? 'border-state-fail/40' : 'border-border-main'}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-text-secondary">{title}</span>
        </div>
        <p className="text-[12px] text-state-fail">{section.error ?? 'Datos invalidos'}</p>
      </div>
    );
  }

  const status = overallStatus(section.checks);
  const bendingChecks = section.checks.filter((c) =>
    ['bending', 'bending-over', 'as-min', 'as-min-comp', 'as-max'].includes(c.id),
  );
  const shearChecks = section.checks.filter((c) =>
    ['shear', 'shear-max', 'rho-w-min', 'stirrup-spacing-max', 'stirrup-legs-spacing'].includes(c.id),
  );
  const spacingChecks = section.checks.filter((c) =>
    ['bar-spacing', 'bar-spacing-impossible'].includes(c.id),
  );
  const crackingChecks = section.checks.filter((c) => c.id === 'cracking');

  return (
    <div
      className={[
        'rounded border px-4 py-3 transition-colors',
        isActive ? BORDER_CLASSES[status] : 'border-border-main',
      ].join(' ')}
      style={isActive ? ambientStyle(status) : undefined}
    >
      {/* Section header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-border-main">
        <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-text-secondary">{title}</span>
        <VerdictBadge status={status} />
      </div>

      {/* Key values */}
      <GroupHeader label="Valores" />
      <ValueRow label="d (canto util)"           value={`${section.d.toFixed(0)} mm`} />
      <ValueRow label={resultLabel('As_tension')}     value={`${section.As.toFixed(0)} mm\u00b2`} />
      <ValueRow label={resultLabel('As_compression')} value={`${section.AsComp.toFixed(0)} mm\u00b2`} />
      <ValueRow label="x (eje neutro)"           value={`${section.x.toFixed(0)} mm`} />
      <ValueRow label={resultLabel('MRd_rc')}         value={fmtSi(section.MRd, 'moment')} />
      <ValueRow label={resultLabel('VRd_c')}          value={fmtSi(section.VRd, 'force')} />
      <ValueRow label={resultLabel('wk')}             value={`${section.wk.toFixed(3)} mm`} />

      {/* Check groups */}
      <GroupHeader label="ELU Flexion" />
      {bendingChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      <GroupHeader label="ELU Cortante" />
      {shearChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {spacingChecks.length > 0 && (
        <>
          <GroupHeader label="Separacion barras" />
          {spacingChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}
        </>
      )}

      <GroupHeader label="ELS Fisuracion" />
      {crackingChecks.map((c) => <CheckRowItem key={c.id} check={c} />)}

      {/* Rebar info footer */}
      <div className="mt-3 pt-2 border-t border-border-sub space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-disabled">Despiece</span>
          <span className="font-mono text-[11px] text-text-primary">{section.rebarSchedule}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-disabled">Solape min. (CE art. 69.5.2)</span>
          <span className="font-mono text-[11px] text-text-primary">{section.lapLength} mm</span>
        </div>
      </div>
    </div>
  );
}

export function RCBeamsResults({ result, activeSection }: RCBeamsResultsProps) {
  const { system } = useUnitSystem();
  const fmtSi = (v: number, q: Quantity) => formatQuantity(v, q, system);

  if (!result.valid) {
    return (
      <div className="flex items-center justify-center h-24 rounded border border-state-fail/30 bg-state-fail/5">
        <p className="text-[12px] text-state-fail text-center px-3">{result.error ?? 'Datos invalidos'}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" aria-label="Resultados">
      <SectionBlock
        title="Vano"
        section={result.vano}
        isActive={activeSection === 'vano'}
        fmtSi={fmtSi}
      />
      <SectionBlock
        title="Apoyo"
        section={result.apoyo}
        isActive={activeSection === 'apoyo'}
        fmtSi={fmtSi}
      />
    </div>
  );
}
