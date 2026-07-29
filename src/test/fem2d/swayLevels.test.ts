// FEM 2D — αcr: detección de niveles por cotas (D12) + endurecimientos.
//
// HISTORIA. El spike del 2026-07-29 (design doc 2026-07-28, D12/OQ5) midió las
// dos estrategias de detección de plantas — filtro por `role === 'pilar'` vs
// TODOS los nudos por cota — y CONFIRMÓ que la segunda se autorregula: una
// celosía triangulada apenas cede ante la sonda lateral (Pratt: αcr ≈ 5813 ≫
// 10, sin amplificar) y un pórtico con pilares inclinados 15° conserva sus
// plantas, que el filtro por rol PERDÍA en silencio (αcr = null y la
// comprobación de estabilidad global desaparecía sin aviso; medido: αcr = 6.89
// con amplificación k = 1.17 que no se aplicaba). El default de producción se
// volteó ese mismo día y la Fase 2 borró el rol — y con él, el modo
// comparativo del spike. Estos tests guardan el contrato RESULTANTE:
//   A) ninguna celosía amplifica (la salva su rigidez, no un filtro);
//   B) el pórtico inclinado tiene αcr SIEMPRE;
//   C) umbral sísmico EN 1998-1 §4.4.2.2 y guarda NOTA 2B de §5.2.1(4)B.

import { describe, expect, it } from 'vitest';
import { beamColumn, fem2dModel, memberUdl, node2d, nodeLoad, support2d } from '../../features/fem2d/builder';
import { checkFem2D, swayStoreyNodes } from '../../features/fem2d/checks';
import { decompose2D } from '../../features/fem2d/decompose';
import { solveAnalysis2D } from '../../features/fem2d/solver2d';
import { prattTrussTemplate } from '../../features/fem2d/templates';
import type { Fem2DModel } from '../../features/fem2d/types';

/** αcr + amplificación con la detección de producción. */
function prodSway(model: Fem2DModel) {
  const { analysis } = decompose2D(model);
  const bundle = solveAnalysis2D(analysis);
  return checkFem2D(model, analysis, bundle);
}

describe('αcr — la detección por cotas se autorregula (D12)', () => {
  it('CRITERIO A — una celosía no amplifica aunque se le detecten niveles', () => {
    const model = prattTrussTemplate.build(prattTrussTemplate.defaults());
    // La Pratt tiene dos cotas de nudos (cordón inf. y sup.): la sonda lateral
    // se ejecuta de verdad. Lo que la salva es su propia rigidez.
    const levels = [...swayStoreyNodes(model).keys()];
    expect(levels.length).toBeGreaterThanOrEqual(2);
    const checks = prodSway(model);
    expect(checks.amplified, `αcr = ${checks.alphaCr}`).toBe(false);
    expect(checks.alphaCr === null || checks.alphaCr >= 10).toBe(true);
  });

  it('CRITERIO A bis — tampoco amplifica una celosía muy esbelta', () => {
    // Canto pequeño y luz grande: el caso menos rígido que la plantilla admite.
    const model = prattTrussTemplate.build({
      ...prattTrussTemplate.defaults(),
      span: 30,
      height: 0.8,
      nPanels: 12,
    });
    const checks = prodSway(model);
    expect(checks.amplified, `αcr = ${checks.alphaCr}`).toBe(false);
  });
});

/** Pórtico con AMBOS pilares inclinados `tilt` m sobre `h` de alto. */
function rakedPortal(
  tilt: number,
  opts: { h?: number; profile?: string; udl?: number; lateral?: 'W' | 'E' } = {},
): Fem2DModel {
  const h = opts.h ?? 4;
  const nodes = [node2d('n1', 0, 0), node2d('n2', tilt, h), node2d('n3', 6 - tilt, h), node2d('n4', 6, 0)];
  const ss = { profileKey: opts.profile ?? 'steel_HEB200', steel: 'S275' as const };
  return fem2dModel({
    templateId: 'custom',
    selfWeight: false,
    nodes,
    members: [
      beamColumn('p1', 'n1', 'n2', { steelSelection: ss }),
      beamColumn('v1', 'n2', 'n3', { steelSelection: ss, ltbSpacing: 1.5 }),
      beamColumn('p2', 'n4', 'n3', { steelSelection: ss }),
    ],
    supports: [support2d('n1', 'pinned'), support2d('n4', 'pinned')],
    loads: [
      memberUdl('l1', 'v1', { lc: 'G', wy: -(opts.udl ?? 40) }),
      nodeLoad('l2', 'n2', { lc: opts.lateral ?? 'W', Fx: 8 }),
    ],
  });
}

describe('CRITERIO B — el pórtico de pilares inclinados tiene αcr SIEMPRE', () => {
  it('el caso de daño real del spike: αcr < 10 y amplificación aplicada', () => {
    // Con el filtro por rol este pórtico daba αcr = null y la amplificación de
    // viento/sismo se saltaba ENTERA. Ahora es imposible por construcción.
    const checks = prodSway(rakedPortal(1.607, { h: 6, profile: 'steel_IPE200', udl: 95 }));
    expect(checks.alphaCr).not.toBeNull();
    expect(checks.alphaCr!).toBeLessThan(10);
    expect(checks.amplified).toBe(true);
    expect(checks.globalChecks.find((c) => c.id === 'alpha-cr')).toBeDefined();
  });
});

describe('Endurecimiento sísmico — EN 1998-1 §4.4.2.2 (θ ≤ 0,2 ⇒ αcr ≥ 5)', () => {
  // Pórtico HEB200 h=6, udl=50: αcr de la combinación gravitatoria = 3.28
  // (sondado). Está DENTRO del rango del método simplificado de EC3 (≥ 3),
  // así que la regla vieja lo dejaba en ámbar amplificado. Pero la combinación
  // sísmica (γG = 1.0) queda en 3.28·1.35 ≈ 4.4 < 5 ⇒ θ > 0,2 y EC8 exige
  // análisis de 2º orden real.
  it('combo con E y αcr < 5: roja aunque EC3 lo diera por amplificable', () => {
    const checks = prodSway(rakedPortal(0, { h: 6, udl: 50, lateral: 'E' }));
    // Precondición del caso: la regla vieja (solo αcr < 3) NO lo pintaba rojo.
    expect(checks.alphaCr!).toBeGreaterThanOrEqual(3);
    const row = checks.globalChecks.find((c) => c.id === 'alpha-cr')!;
    expect(row.eta).toBeGreaterThanOrEqual(1);
    expect(row.val).toContain('EN 1998-1');
    expect(checks.status).toBe('fail');
  });

  it('control: la misma estructura con viento se queda en ámbar amplificado', () => {
    const checks = prodSway(rakedPortal(0, { h: 6, udl: 50, lateral: 'W' }));
    expect(checks.alphaCr!).toBeGreaterThanOrEqual(3);
    const row = checks.globalChecks.find((c) => c.id === 'alpha-cr')!;
    expect(row.eta).toBeLessThan(1);
    expect(checks.amplified).toBe(true);
  });
});

/** Pórtico cuyo dintel IPE200 está comprimido por dos cargas G horizontales
 *  opuestas en los aleros (empuje tipo tierras). N_cr,dintel = π²·EI/L² =
 *  π²·4080/36 ≈ 1119 kN → umbral NOTA 2B = 0,09·N_cr ≈ 101 kN. */
function squeezedPortal(F: number): Fem2DModel {
  const nodes = [node2d('n1', 0, 0), node2d('n2', 0, 3), node2d('n3', 6, 3), node2d('n4', 6, 0)];
  const cols = { profileKey: 'steel_HEB200', steel: 'S275' as const };
  const beam = { profileKey: 'steel_IPE200', steel: 'S275' as const };
  return fem2dModel({
    templateId: 'custom',
    selfWeight: false,
    nodes,
    members: [
      beamColumn('p1', 'n1', 'n2', { steelSelection: cols }),
      beamColumn('v1', 'n2', 'n3', { steelSelection: beam, ltbSpacing: 1.5 }),
      beamColumn('p2', 'n4', 'n3', { steelSelection: cols }),
    ],
    supports: [support2d('n1', 'pinned'), support2d('n4', 'pinned')],
    loads: [
      memberUdl('l1', 'v1', { lc: 'G', wy: -10 }),
      nodeLoad('l2', 'n2', { lc: 'G', Fx: F }),
      nodeLoad('l3', 'n3', { lc: 'G', Fx: -F }),
    ],
  });
}

describe('Guarda NOTA 2B — compresión significativa en el dintel', () => {
  it('N_Ed ≥ 9% del Euler del dintel: el verde se degrada a ámbar y la fila lo explica', () => {
    const checks = prodSway(squeezedPortal(120)); // N ≈ 1,35·120 kN ≫ 101 kN
    const row = checks.globalChecks.find((c) => c.id === 'alpha-cr')!;
    expect(row.val).toContain('NOTA 2B');
    expect(row.val).toContain('v1');
    expect(row.eta).toBeCloseTo(0.97, 5);
  });

  it('control: con compresión pequeña la fila se queda verde', () => {
    const checks = prodSway(squeezedPortal(10)); // N ≈ 13,5 kN ≪ 101 kN
    const row = checks.globalChecks.find((c) => c.id === 'alpha-cr')!;
    expect(row.val).not.toContain('NOTA 2B');
    expect(row.eta).toBe(0.5);
  });

  it('la misma compresión en un PILAR no dispara la guarda: ese caso lo vigila αcr', () => {
    // Pilares IPE200 de 6 m muy cargados: N ≈ 1,35·(60·6/2) ≈ 243 kN ≥ 9%·N_cr
    // (≈ 101 kN a L=6), pero |Δy| > |Δx| — la compresión de un pilar es el caso
    // que la fórmula de planta SÍ contempla (NOTA 2B habla de vigas/dinteles).
    const checks = prodSway(rakedPortal(0, { h: 6, profile: 'steel_IPE200', udl: 60 }));
    const row = checks.globalChecks.find((c) => c.id === 'alpha-cr')!;
    expect(row.val).not.toContain('NOTA 2B');
  });
});
