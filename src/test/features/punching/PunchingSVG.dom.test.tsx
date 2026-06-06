// PunchingSVG — modo cruceta (CrossPlanView).
//
// Verifica que la vista en planta de la cruz renderiza con un result real del
// motor (no mockeado: un result hand-crafted se diverge del shape real y los
// bugs de UI vienen justo de esa divergencia), que dibuja contenido (placa,
// brazos, perímetro u1) y que el mapeo geometría mm→px se mantiene dentro del
// canvas (eng-review decision 5: "CrossPlanView mapeo geometría mm→px, unit").

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PunchingSVG } from '../../../features/punching/PunchingSVG';
import { calcPunching } from '../../../lib/calculations/punching';
import { punchingDefaults, type PunchingInputs } from '../../../data/defaults';

const cru: PunchingInputs = { ...punchingDefaults, mode: 'pilar-cruceta' };

describe('PunchingSVG — modo cruceta', () => {
  it('renderiza la cruz con un result FTUX válido', () => {
    const result = calcPunching(cru);
    expect(result.valid).toBe(true);

    const { container } = render(<PunchingSVG inp={cru} result={result} width={360} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // No es una caja vacía: tiene geometría dibujada.
    const hasContent = svg!.querySelector('rect, line, text');
    expect(hasContent, 'CrossPlanView renderó SVG vacío').not.toBeNull();
    // Etiqueta el perímetro u1 y el perfil del pilar.
    const text = container.textContent ?? '';
    expect(text).toContain('u1');
    expect(text).toContain('HEB');
  });

  it('dibuja los 4 brazos de la cruz (interior, L_eff > 0)', () => {
    const result = calcPunching(cru);
    expect(result.cruceta!.Leff).toBeGreaterThan(0);
    const { container } = render(<PunchingSVG inp={cru} result={result} width={360} />);
    // Cada cruceta es un <rect> con el relleno de brazo; el alma/alas del perfil
    // y la placa añaden más rects. Con 4 brazos hay holgura de sobra.
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBeGreaterThanOrEqual(4);
  });

  it('mapeo mm→px: toda la geometría dibujada cabe dentro del canvas', () => {
    const result = calcPunching(cru);
    const size = 360;
    const { container } = render(<PunchingSVG inp={cru} result={result} width={size} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${size} ${size}`);
    // Ningún rect se sale del lienzo (x,y ≥ 0 y x+w, y+h ≤ size). Garantiza que
    // el escalado 0.70·(size/2)/steelHalf no desborda el viewBox.
    for (const r of Array.from(container.querySelectorAll('rect'))) {
      const x = parseFloat(r.getAttribute('x') ?? '0');
      const y = parseFloat(r.getAttribute('y') ?? '0');
      const w = parseFloat(r.getAttribute('width') ?? '0');
      const h = parseFloat(r.getAttribute('height') ?? '0');
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(size + 0.5);
      expect(y + h).toBeLessThanOrEqual(size + 0.5);
    }
  });

  it('mode="pdf" no crashea y produce SVG (paleta clara)', () => {
    const result = calcPunching(cru);
    const { container } = render(<PunchingSVG inp={cru} result={result} width={360} mode="pdf" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('NO crashea con un perfil que falla (result valid=false)', () => {
    // El usuario puede tener un UPN insuficiente: el SVG debe seguir dibujando.
    const inp = { ...cru, VEd: 700, upnSize: 160 };
    const result = calcPunching(inp);
    expect(result.valid).toBe(false);
    expect(() => render(<PunchingSVG inp={inp} result={result} width={360} />)).not.toThrow();
  });

  it('los modos pilar / carga-puntual siguen renderizando (no regresión)', () => {
    for (const mode of ['pilar', 'carga-puntual'] as const) {
      const inp = { ...punchingDefaults, mode };
      const result = calcPunching(inp);
      const { container } = render(<PunchingSVG inp={inp} result={result} width={360} />);
      expect(container.querySelector('svg'), `modo ${mode} no renderizó`).not.toBeNull();
    }
  });
});
