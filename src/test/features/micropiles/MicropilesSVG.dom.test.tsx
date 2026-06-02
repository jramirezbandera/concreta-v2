// MicropilesSVG — verifica que las 4 vistas renderan sin crash con un
// result calculado por el motor real.
//
// Estrategia: motor → result → mount. No mockear el result (un result
// hand-crafted se diverge del shape real y los bugs de UI vienen
// precisamente de esa divergencia).

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MicropilesSVG, type MicropilesView } from '../../../features/micropiles/MicropilesSVG';
import { calcMicropiles } from '../../../lib/calculations/micropiles';
import { micropilesDefaults, micropilesSoilDefaults } from '../../../data/defaults';

const VIEWS: MicropilesView[] = ['profile', 'rfcCurve', 'topSection', 'semaphores'];

describe('MicropilesSVG', () => {
  for (const view of VIEWS) {
    it(`vista "${view}" rendera con un result FTUX válido`, () => {
      const result = calcMicropiles(micropilesDefaults, micropilesSoilDefaults);
      expect(result.valid).toBe(true);

      const { container } = render(
        <MicropilesSVG
          inp={micropilesDefaults}
          soil={micropilesSoilDefaults}
          result={result}
          view={view}
        />,
      );
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      // El SVG no debe ser una caja vacía: tiene al menos un <text> o
      // un <rect>/<circle>/<path> de contenido.
      const hasContent = svg!.querySelector('text, rect, circle, path, line');
      expect(hasContent, `vista ${view} renderó SVG vacío`).not.toBeNull();
    });
  }

  it('respeta props width/height en el atributo viewBox', () => {
    const result = calcMicropiles(micropilesDefaults, micropilesSoilDefaults);
    const { container } = render(
      <MicropilesSVG
        inp={micropilesDefaults}
        soil={micropilesSoilDefaults}
        result={result}
        view="profile"
        width={800}
        height={600}
      />,
    );
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 800 600');
    expect(svg.getAttribute('width')).toBe('800');
    expect(svg.getAttribute('height')).toBe('600');
  });

  it('mode="pdf" no crashea y produce SVG (paleta clara)', () => {
    const result = calcMicropiles(micropilesDefaults, micropilesSoilDefaults);
    for (const view of VIEWS) {
      const { container } = render(
        <MicropilesSVG
          inp={micropilesDefaults}
          soil={micropilesSoilDefaults}
          result={result}
          view={view}
          mode="pdf"
        />,
      );
      expect(container.querySelector('svg'), `pdf mode crashed en vista ${view}`).not.toBeNull();
    }
  });

  it('vista "semaphores" muestra las utilizaciones ih/ic del result', () => {
    const result = calcMicropiles(micropilesDefaults, micropilesSoilDefaults);
    const { container } = render(
      <MicropilesSVG
        inp={micropilesDefaults}
        soil={micropilesSoilDefaults}
        result={result}
        view="semaphores"
      />,
    );
    const text = container.textContent ?? '';
    // ih FTUX ≈ 0.71 (post D1-bis: Rfc cae a ~496 → 350/496 ≈ 0.71).
    // ic ≈ 0.52: con el pandeo AUTO (default), el suelo por defecto tiene
    // E1 granular Nspt=0 → arena floja → CR=8 (R=0.854), algo más severo que
    // el antiguo CR=7,5 manual (R=0.8675), de ahí 0.51→0.52. Formato con
    // punto decimal — adimensionales no llevan unidad ni coma local.
    expect(text).toMatch(/0\.71/);
    expect(text).toMatch(/0\.52/);
    // Y debe nombrar las dos comprobaciones, no solo los números.
    expect(text).toMatch(/Hundimiento por fuste/);
    expect(text).toMatch(/Tope compresión/);
  });

  it('se puede cambiar de vista re-renderizando con otro prop "view"', () => {
    const result = calcMicropiles(micropilesDefaults, micropilesSoilDefaults);
    const { rerender, container } = render(
      <MicropilesSVG
        inp={micropilesDefaults}
        soil={micropilesSoilDefaults}
        result={result}
        view="profile"
      />,
    );
    const profileMarkup = container.innerHTML;
    rerender(
      <MicropilesSVG
        inp={micropilesDefaults}
        soil={micropilesSoilDefaults}
        result={result}
        view="rfcCurve"
      />,
    );
    expect(container.innerHTML).not.toBe(profileMarkup);
  });

  it('NO crashea cuando se le pasa un result valid=false (caso defensivo)', () => {
    // Forzar invalid con effort=tension + cualquier configuración; en
    // realidad la UI siempre pasa un result válido, pero el componente
    // debería ser defensivo. Si crashea aquí, el reset del módulo
    // explotaría medio render. Construimos un invalid via L=0 (cota
    // apoyo ≥ cabeza).
    const invalidResult = calcMicropiles(
      { ...micropilesDefaults, toeDepth: 0, topDepth: 0 },
      micropilesSoilDefaults,
    );
    expect(invalidResult.valid).toBe(false);

    for (const view of VIEWS) {
      expect(() => {
        render(
          <MicropilesSVG
            inp={micropilesDefaults}
            soil={micropilesSoilDefaults}
            result={invalidResult}
            view={view}
          />,
        );
      }, `crash en vista ${view} con result inválido`).not.toThrow();
    }
  });

  // ── T4: SVG fallback "Tubo no válido" ──────────────────────────────────
  // Cuando el tubo personalizado tiene valores incoherentes (NaN, 2e≥de),
  // resolveTubeGeometry devuelve null y TopSectionView debe pintar el
  // placeholder, no quedarse en blanco. Es la garantía de que el usuario
  // siempre VE algo, no un círculo gris vacío sin explicación.
  describe('TopSectionView fallback con tubo inválido', () => {
    it('tube=custom con 2·e ≥ de → SVG renderiza "Tubo no válido"', () => {
      const inp = {
        ...micropilesDefaults,
        tube: 'custom' as const,
        customTubeDe: 50,
        customTubeE: 25,    // 2·25 = 50 = de, sin hueco interior
      };
      const result = calcMicropiles(inp, micropilesSoilDefaults);
      expect(result.valid).toBe(false);

      const { container } = render(
        <MicropilesSVG
          inp={inp}
          soil={micropilesSoilDefaults}
          result={result}
          view="topSection"
        />,
      );
      const text = container.textContent ?? '';
      expect(text).toContain('Tubo no válido');
      // Y aun así muestra Dn (la perforación es input directo, no derivada).
      expect(text).toMatch(/Ø.*perf/);
    });

    it('tube=custom con customTubeDe=0 → "Tubo no válido"', () => {
      const inp = {
        ...micropilesDefaults,
        tube: 'custom' as const,
        customTubeDe: 0,
        customTubeE: 9,
      };
      const result = calcMicropiles(inp, micropilesSoilDefaults);
      const { container } = render(
        <MicropilesSVG inp={inp} soil={micropilesSoilDefaults} result={result} view="topSection" />,
      );
      expect(container.textContent ?? '').toContain('Tubo no válido');
    });
  });

  // ── T3: TopSectionView con tubo custom válido ──────────────────────────
  // Renderiza el tubo derivado de inputs (NO de result.de/di), garantía
  // de que el SVG funciona aunque el motor invalide por otra causa.
  it('TopSectionView dibuja el tubo personalizado con sus dimensiones', () => {
    const inp = {
      ...micropilesDefaults,
      drillDiameter: 220,
      tube: 'custom' as const,
      customTubeDe: 120,
      customTubeE: 10,
    };
    const result = calcMicropiles(inp, micropilesSoilDefaults);
    expect(result.valid).toBe(true);

    const { container } = render(
      <MicropilesSVG inp={inp} soil={micropilesSoilDefaults} result={result} view="topSection" />,
    );
    const text = container.textContent ?? '';
    // Las cotas Ø se etiquetan con coma decimal (locale es-ES).
    expect(text).toMatch(/Ø220,0 perf/);     // Dn = drillDiameter
    expect(text).toMatch(/Ø120,0 tubo/);     // de del custom
    expect(text).toMatch(/Ø100,0 int/);      // di = de - 2e = 100
  });
});
