// RetainingWallResults — el panel PINTA todas las comprobaciones del motor.
//
// Tercer caso de la misma familia (Empresillado y rc-columns fueron los otros,
// 2026-08-03): el panel repartía los checks en 5 listas de ids escritas a mano
// y el veredicto se calcula sobre `result.checks` entero. La lista del talón
// pedía 'zapata-asmin-trans', un id que el motor NO emite — emite
// 'zapata-asmin-trans-inf' y '-sup'. Con los defaults del módulo y transversal
// Ø8@300 ambas incumplen al 337% y ninguna se veía en pantalla; el PDF sí las
// pintaba, y `src/test/calc/retainingWall.test.ts` tenía 4 tests verdes sobre
// ellas.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { RetainingWallResults } from '../../../features/retaining-wall/RetainingWallResults';
import { calcRetainingWall } from '../../../lib/calculations/retainingWall';
import { retainingWallDefaults, type RetainingWallInputs } from '../../../data/defaults';
import { UnitSystemProvider } from '../../../lib/units/UnitSystemProvider';

function renderPanel(overrides: Partial<RetainingWallInputs> = {}) {
  const inp = { ...retainingWallDefaults, ...overrides };
  const result = calcRetainingWall(inp);
  // MemoryRouter: el panel enlaza al módulo Taludes (estabilidad global).
  const { container } = render(
    <UnitSystemProvider>
      <MemoryRouter>
        <RetainingWallResults result={result} inp={inp} />
      </MemoryRouter>
    </UnitSystemProvider>,
  );
  return { container, result };
}

const ids = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-check-id]'))
    .map((el) => el.getAttribute('data-check-id'));

// Transversal ligera → zapata-asmin-trans-inf/sup incumplen (337%)
const LIGHT_TRANSVERSE: Partial<RetainingWallInputs> = {
  diam_zt_inf: 8, sep_zt_inf: 300, diam_zt_sup: 8, sep_zt_sup: 300,
};

const CASES: [string, Partial<RetainingWallInputs>][] = [
  ['defaults', {}],
  ['transversal ligera (Ø8@300)', LIGHT_TRANSVERSE],
  ['transversal correcta (Ø16@150)', { diam_zt_inf: 16, sep_zt_inf: 150, diam_zt_sup: 16, sep_zt_sup: 150 }],
  ['con sismo (Ab=0.16)', { ...LIGHT_TRANSVERSE, Ab: 0.16, S: 1.2 }],
  ['deslizamiento impedido (fila neutra)', { ...LIGHT_TRANSVERSE, slidingRestrained: true }],
];

describe('RetainingWallResults — ninguna comprobación invisible', () => {
  for (const [label, overrides] of CASES) {
    it(`${label}: todas las filas de result.checks están en el DOM`, () => {
      const { container, result } = renderPanel(overrides);
      const rendered = ids(container);
      for (const c of result.checks) {
        expect(rendered, `falta la fila ${c.id}`).toContain(c.id);
      }
    });

    it(`${label}: si algo incumple, hay una fila que lo justifica`, () => {
      const { container, result } = renderPanel(overrides);
      const failing = result.checks.filter((c) => !c.neutral && c.status === 'fail');
      for (const c of failing) {
        expect(
          container.querySelector(`[data-check-id="${c.id}"]`),
          `fila ${c.id} (${(c.utilization * 100).toFixed(0)}%) no pintada`,
        ).not.toBeNull();
      }
    });
  }

  it('el armado transversal de zapata incumple y SE VE (inf y sup)', () => {
    const { container, result } = renderPanel(LIGHT_TRANSVERSE);
    for (const id of ['zapata-asmin-trans-inf', 'zapata-asmin-trans-sup']) {
      const check = result.checks.find((c) => c.id === id);
      expect(check, `el motor ya no emite ${id}`).toBeDefined();
      expect(check!.status).toBe('fail');
      const row = container.querySelector(`[data-check-id="${id}"]`);
      expect(row, `fila ${id} no pintada`).not.toBeNull();
      expect(row!.textContent).toContain('INCUMPLE');
    }
  });
});
