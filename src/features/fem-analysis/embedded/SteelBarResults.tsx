// FEM 2D — SteelBarResults wrapper (Lane R6 V1.1)
//
// Renders <SteelBeamsResults> with the preserved SteelBeamResult from
// solveDesignModel.

import type { SteelBeamResult } from '../../../lib/calculations/steelBeams';
import { SteelBeamsResults } from '../../steel-beams/SteelBeamsResults';
import type { BarResult, DesignBar } from '../types';

interface Props {
  barResult: BarResult | undefined;
  bar: DesignBar;
}

export function SteelBarResults({ barResult, bar }: Props) {
  const result = barResult?.steelResult as SteelBeamResult | undefined;
  const deflLimit = bar.steelSelection?.deflLimit ?? 300;

  if (!barResult || !result || !result.valid) {
    return (
      <div
        style={{
          padding: '24px 16px',
          color: 'var(--color-text-disabled)',
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        Comprobaciones pendientes — el modelo no produce resultados válidos
        para esta barra todavía.
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 10px' }}>
      <SteelBeamsResults result={result} deflLimit={deflLimit} compact />
    </div>
  );
}
