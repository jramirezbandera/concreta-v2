// EmpresalladoResults — el panel PINTA todas las comprobaciones del motor.
//
// Punto ciego que motiva esta suite: el panel elegía 5 ids a mano
// (cordones, pandeo-local, pandeo-global, pletina-flexion, pletina-cortante)
// mientras el veredicto de cabecera se calculaba sobre TODAS las filas. Con el
// caso 139×48 / L80x8 la que incumplía era `cordon-interaccion` (105%) →
// «INCUMPLE» en rojo sin ninguna fila roja que lo explicara. El PDF sí la
// pintaba, así que la suite de cálculo y la de PDF estaban las dos en verde.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { EmpresalladoResults } from '../../../features/empresillado/EmpresalladoResults';
import { calcEmpresillado } from '../../../lib/calculations/empresillado';
import { empresalladoDefaults, type EmpresalladoInputs } from '../../../data/defaults';
import { UnitSystemProvider } from '../../../lib/units/UnitSystemProvider';

function inp(overrides: Partial<EmpresalladoInputs> = {}): EmpresalladoInputs {
  return { ...empresalladoDefaults, ...overrides };
}

function renderPanel(i: EmpresalladoInputs) {
  const result = calcEmpresillado(i);
  const { container } = render(
    <UnitSystemProvider>
      <EmpresalladoResults result={result} inp={i} />
    </UnitSystemProvider>,
  );
  return { container, result };
}

const ids = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-check-id]'))
    .map((el) => el.getAttribute('data-check-id'));

// Caso del informe de bug: pilar 139×48, L80x8, s=50 → cordon-interaccion 105%
const FAIL_CASE = inp({
  bc: 139, hc: 48, L: 3.75,
  N_Ed: 300, Mx_Ed: 30, My_Ed: 30, Vd: 0,
  perfil: 'L80x8', fy: 235, beta_x: 1, beta_y: 1,
  s: 50, lp: 8, bp: 36, tp: 8,
});

describe('EmpresalladoResults — ninguna comprobación invisible', () => {
  it('defaults: todas las filas de result.checks están en el DOM', () => {
    const { container, result } = renderPanel(empresalladoDefaults);
    const rendered = ids(container);
    for (const c of result.checks) expect(rendered).toContain(c.id);
  });

  it('caso INCUMPLE: todas las filas están en el DOM', () => {
    const { container, result } = renderPanel(FAIL_CASE);
    const rendered = ids(container);
    for (const c of result.checks) expect(rendered).toContain(c.id);
  });

  it('si el veredicto es INCUMPLE hay al menos una fila que lo justifica', () => {
    const { container, result } = renderPanel(FAIL_CASE);
    const failing = result.checks.filter((c) => !c.neutral && c.status === 'fail');
    expect(failing.length).toBeGreaterThan(0);
    expect(container.textContent).toContain('INCUMPLE');
    for (const c of failing) {
      const row = container.querySelector(`[data-check-id="${c.id}"]`);
      expect(row, `fila ${c.id} (${(c.utilization * 100).toFixed(0)}%) no pintada`).not.toBeNull();
      expect(row!.textContent).toContain('INCUMPLE');
    }
  });

  it('cordon-interaccion se pinta con su utilización > 1', () => {
    const { container, result } = renderPanel(FAIL_CASE);
    const check = result.checks.find((c) => c.id === 'cordon-interaccion')!;
    expect(check.utilization).toBeGreaterThan(1);
    expect(container.querySelector('[data-check-id="cordon-interaccion"]')).not.toBeNull();
  });

  it('la nota de alcance sale como informativa (etiqueta), sin 0% ni barra', () => {
    const { container } = renderPanel(empresalladoDefaults);
    const row = container.querySelector('[data-check-id="scope-note"]')!;
    expect(row).not.toBeNull();
    expect(row.textContent).toContain('LÍMITES');
    expect(row.textContent).not.toContain('0%');
    expect(row.querySelector('[role="presentation"]')).toBeNull();
  });
});

describe('EmpresalladoResults — la descomposición de N_chord cuadra', () => {
  it('N_Ed/4 + aporte Mx + aporte My = N_chord (2º orden, no 1er orden)', () => {
    const i = FAIL_CASE;
    const r = calcEmpresillado(i);
    const contrib_N  = i.N_Ed / 4;
    const contrib_Mx = (r.MEd_IIX * 100 * r.A_ang * r.dy) / r.I_X;
    const contrib_My = (r.MEd_IIY * 100 * r.A_ang * r.dx) / r.I_Y;
    expect(contrib_N + contrib_Mx + contrib_My).toBeCloseTo(r.N_chord_max, 6);

    // La descomposición ANTERIOR (primer orden) no cuadraba — el panel
    // enseñaba 75.0 + 28.5 + 10.4 junto a un N_chord de 117.3 kN.
    const oldMx = (Math.abs(i.Mx_Ed) * 100) / (2 * r.hy);
    const oldMy = (Math.abs(i.My_Ed) * 100) / (2 * r.hx);
    expect(contrib_N + oldMx + oldMy).not.toBeCloseTo(r.N_chord_max, 2);
  });
});
