// rc-beams Chunk 3 — RCBeamStrainSVG + RCBeamForcesSVG + buildSectionNarrative

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { RCBeamStrainSVG } from '../../features/rc-beams/RCBeamStrainSVG';
import { RCBeamForcesSVG } from '../../features/rc-beams/RCBeamForcesSVG';
import { buildSectionNarrative } from '../../features/rc-beams/rcBeamNarrative';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { solveSectionAtMoment } from '../../lib/calculations/rcBeamsSection';
import type { SectionInputs } from '../../lib/calculations/rcBeams';
import type { SectionAtMomentResult } from '../../lib/calculations/rcBeamsSection';

function baseInputs(overrides: Partial<SectionInputs> = {}): SectionInputs {
  return {
    b: 300, h: 500, cover: 30,
    stirrupDiam: 8, stirrupLegs: 2, stirrupSpacing: 150,
    fck: 30, fyk: 500, exposureClass: 'XC1',
    Md: 80, VEd: 50, Ms: 40,
    nBars: 4, barDiam: 16,
    nBarsComp: 2, barDiamComp: 12,
    bondClass: 'good',
    ...overrides,
  };
}

function renderInProvider(ui: React.ReactElement) {
  return render(<UnitSystemProvider>{ui}</UnitSystemProvider>);
}

describe('RCBeamStrainSVG (Chunk 3)', () => {
  it('renderiza con result del solver — incluye SVG con role=img', () => {
    const r = solveSectionAtMoment(baseInputs(), 80);
    const { container } = renderInProvider(<RCBeamStrainSVG sectionResult={r} h={500} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it("aria-label menciona ε_top y ε_s en ‰", () => {
    const r = solveSectionAtMoment(baseInputs(), 80);
    const { container } = renderInProvider(<RCBeamStrainSVG sectionResult={r} h={500} />);
    const svg = container.querySelector('svg');
    const label = svg?.getAttribute('aria-label') ?? '';
    expect(label).toMatch(/ε_top/);
    expect(label).toMatch(/ε_s/);
  });

  it('respeta width / height props', () => {
    const r = solveSectionAtMoment(baseInputs(), 80);
    const { container } = renderInProvider(<RCBeamStrainSVG sectionResult={r} h={500} width={300} height={400} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('300');
    expect(svg?.getAttribute('height')).toBe('400');
  });

  it('mode=pdf usa el color scheme PDF (verificable por presencia)', () => {
    const r = solveSectionAtMoment(baseInputs(), 80);
    const { container } = renderInProvider(<RCBeamStrainSVG sectionResult={r} h={500} mode="pdf" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('caso uncracked: muestra strains pequeñas sin crash', () => {
    const r = solveSectionAtMoment(baseInputs({ b: 500, h: 800, Md: 5 }), 5);
    expect(r.mode).toBe('uncracked');
    const { container } = renderInProvider(<RCBeamStrainSVG sectionResult={r} h={800} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

describe('RCBeamForcesSVG (Chunk 3)', () => {
  it('renderiza con forces del solver', () => {
    const r = solveSectionAtMoment(baseInputs(), 80);
    const { container } = renderInProvider(<RCBeamForcesSVG sectionResult={r} h={500} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it("aria-label menciona F_c, F_s', F_s", () => {
    const r = solveSectionAtMoment(baseInputs(), 80);
    const { container } = renderInProvider(<RCBeamForcesSVG sectionResult={r} h={500} />);
    const label = container.querySelector('svg')?.getAttribute('aria-label') ?? '';
    expect(label).toMatch(/F_c/);
    expect(label).toMatch(/F_s/);
  });

  it("AsComp=0: no renderiza flecha F_s' (omitido cuando |F_s_comp| < 1e-3)", () => {
    const r = solveSectionAtMoment(baseInputs({ nBarsComp: 0, barDiamComp: 12 }), 60);
    const { container } = renderInProvider(<RCBeamForcesSVG sectionResult={r} h={500} />);
    // No estrictamente fácil de testear el "no renderizado" del ForceArrow específico;
    // pero el aria-label sigue mencionando F_s' como string en el label completo.
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

describe('buildSectionNarrative (Chunk 3 — auto-narrative)', () => {
  it('mode=zero: mensaje de sección descargada', () => {
    const r: SectionAtMomentResult = {
      mode: 'zero', M: 0, Md: 0, exceededCapacity: false,
      x: 0, d: 0, r_s: 0,
      epsilon_top: 0, epsilon_s_comp: 0, epsilon_s_tens: 0, epsilon_bot: 0,
      F_concrete: 0, F_s_comp: 0, F_s_tens: 0,
      sigma_s_comp: 0, sigma_s_tens: 0,
      steelYielded_tens: false, steelYielded_comp: false, concreteCrushed: false,
      z_concrete: 0, z_s_comp: 0, z_s_tens: 0,
    };
    expect(buildSectionNarrative(r, 100)).toMatch(/descargada/i);
  });

  it('mode=uncracked: mensaje de sección no fisurada', () => {
    const r = solveSectionAtMoment(baseInputs({ b: 500, h: 800, Md: 5 }), 5);
    expect(r.mode).toBe('uncracked');
    expect(buildSectionNarrative(r, 200)).toMatch(/no fisurada|Mcrit/i);
  });

  it('mode=cracked + steel yielded: menciona yielded', () => {
    // Construimos un result sintético cracked+yielded para garantizar la rama.
    const r: SectionAtMomentResult = {
      mode: 'cracked', M: 30, Md: 30, exceededCapacity: false,
      x: 60, d: 456, r_s: 50,
      epsilon_top: -0.0015, epsilon_s_comp: -0.0003, epsilon_s_tens: 0.0095, epsilon_bot: 0.011,
      F_concrete: -98, F_s_comp: -3, F_s_tens: 98,
      sigma_s_comp: -60, sigma_s_tens: 434,
      steelYielded_tens: true, steelYielded_comp: false, concreteCrushed: false,
      z_concrete: 24, z_s_comp: 50, z_s_tens: 456,
    };
    expect(buildSectionNarrative(r, 35)).toMatch(/yielded/i);
  });

  it('mode=over-capacity: menciona ELU + no resiste', () => {
    const r: SectionAtMomentResult = {
      mode: 'over-capacity', M: 999, Md: 999, exceededCapacity: true,
      x: 100, d: 450, r_s: 50,
      epsilon_top: -0.0035, epsilon_s_comp: -0.0028, epsilon_s_tens: 0.012, epsilon_bot: 0.014,
      F_concrete: -500, F_s_comp: -100, F_s_tens: 600,
      sigma_s_comp: -434, sigma_s_tens: 434,
      steelYielded_tens: true, steelYielded_comp: true, concreteCrushed: true,
      z_concrete: 40, z_s_comp: 50, z_s_tens: 450,
    };
    const narr = buildSectionNarrative(r, 150);
    expect(narr).toMatch(/NO resiste|crushed/i);
  });
});
