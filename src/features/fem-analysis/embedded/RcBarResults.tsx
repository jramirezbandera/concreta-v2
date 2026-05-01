// FEM 2D — RcBarResults wrapper (Lane R6 V1.1)
//
// Renders <RCBeamsResults hideSectionTabs> with the preserved RCBeamResult
// (full output of calcRCBeam) from solveDesignModel. activeSection is owned by
// the parent (index.tsx), shared with <ResultsHeader>.
//
// Guard: when bar has no armado, perBar[id].rcResult is undefined → show
// "pendiente" hint instead of crashing the embed.

import type { RCBeamResult } from '../../../lib/calculations/rcBeams';
import { RCBeamsResults } from '../../rc-beams/RCBeamsResults';
import type { BarResult } from '../types';

interface Props {
  barResult: BarResult | undefined;
  activeSection: 'vano' | 'apoyo';
}

export function RcBarResults({ barResult, activeSection }: Props) {
  const result = barResult?.rcResult as RCBeamResult | undefined;

  if (!barResult || barResult.status === 'pending' || !result) {
    return (
      <div
        style={{
          padding: '24px 16px',
          color: 'var(--color-text-disabled)',
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        Comprobaciones pendientes — completa el armado de la barra para ver los
        resultados.
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 10px' }}>
      <RCBeamsResults result={result} activeSection={activeSection} hideSectionTabs compact />
    </div>
  );
}
