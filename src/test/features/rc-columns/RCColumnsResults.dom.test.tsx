// RCColumnsResults — el panel PINTA todas las comprobaciones del motor.
//
// Mismo punto ciego que en Empresillado (2026-08-03): los dos paneles eligen
// los ids a mano y `overallStatus(result.checks)` juzga sobre TODOS. La lista
// del panel RECTANGULAR se quedó sin `as-min-mech` (el circular sí lo tenía):
// con 600×600, 4Ø16 y N_Ed = 4000 kN esa fila es la ÚNICA que incumple (124%)
// → cabecera INCUMPLE y ni una sola fila roja en pantalla. El PDF sí la pinta,
// y `src/test/calc/rcColumns.test.ts` ya tenía 3 tests sobre ella: todo verde.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RCColumnsResults } from '../../../features/rc-columns/RCColumnsResults';
import { calcRCColumn } from '../../../lib/calculations/rcColumns';
import { rcColumnDefaults, type RCColumnInputs } from '../../../data/defaults';
import { UnitSystemProvider } from '../../../lib/units/UnitSystemProvider';

function renderPanel(overrides: Partial<RCColumnInputs> = {}) {
  const inp = { ...rcColumnDefaults, ...overrides };
  const result = calcRCColumn(inp);
  const { container } = render(
    <UnitSystemProvider>
      <RCColumnsResults result={result} />
    </UnitSystemProvider>,
  );
  return { container, result };
}

const ids = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-check-id]'))
    .map((el) => el.getAttribute('data-check-id'));

// Caso reproducido: as-min-mech (124%) es el único INCUMPLE.
const HEAVY_LIGHT_REBAR: Partial<RCColumnInputs> = {
  b: 600, h: 600, cornerBarDiam: 16, nBarsX: 0, nBarsY: 0,
  Nd: 4000, MEdy: 20, MEdz: 0, L: 3, stirrupSpacing: 90,
};

const CASES: [string, Partial<RCColumnInputs>][] = [
  ['rectangular (defaults)', {}],
  ['rectangular — axil alto, armadura ligera', HEAVY_LIGHT_REBAR],
  ['rectangular — barras intermedias', { nBarsX: 2, nBarsY: 2, Nd: 1200, MEdy: 80, MEdz: 40 }],
  ['circular (defaults)', { sectionType: 'circular' }],
  ['circular — axil alto, armadura ligera', { sectionType: 'circular', D: 700, nBarsCirc: 4, circBarDiam: 16, Nd: 4000 }],
];

describe('RCColumnsResults — ninguna comprobación invisible', () => {
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

  it('el caso 600×600 / 4Ø16 / 4000 kN incumple SOLO por as-min-mech, y se ve', () => {
    const { container, result } = renderPanel(HEAVY_LIGHT_REBAR);
    const failing = result.checks.filter((c) => c.status === 'fail').map((c) => c.id);
    expect(failing).toEqual(['as-min-mech']);   // el fixture sigue siendo el que se quiso

    const row = container.querySelector('[data-check-id="as-min-mech"]');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('INCUMPLE');
  });
});
