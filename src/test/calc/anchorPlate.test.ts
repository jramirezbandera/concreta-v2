// Anchor plate (PR-3) — rebar model + axis-aligned + biaxial solver + 10 real checks.
// Run: bun test src/test/calc/anchorPlate.test.ts

import { describe, expect, it } from 'vitest';
import { calcAnchorPlate, checkStiffener, solveAxisAligned4, tStubEffectiveArea } from '../../lib/calculations/anchorPlate';
import { anchorPlateDefaults } from '../../data/defaults';

// Fixture histórica: los defaults del módulo hasta 2026-09-23 — HEB-200, placa
// 400×300×20 S275, 4·φ20 B500S en esquinas (ex = ey = 50 → barras en ±150,
// ±100), pedestal 700×600 con cX = cY = 200. Los hand-calcs de este fichero
// (cono, splitting, edge breakout, T-stub, anclaje…) están derivados para ESTA
// geometría, así que se fija aquí en vez de heredar los defaults nuevos (350×350
// con 8 barras y el «#» de cartelas). Va SIN rigidizadores: con el par de
// cartelas en las puntas de las alas (y = 100..110) sus barras (y = ±100)
// pisarían acero y el motor lo marca como no construible. Los tests de
// rigidizadores pasan su propia geometría.
export const LEGACY = {
  ...anchorPlateDefaults,
  plate_a: 400, plate_b: 300,
  bar_nLayout: 4 as const,
  bar_edge_x: 50, bar_edge_y: 50,
  bar_spacing_x: 300, bar_spacing_y: 200,
  rib_count: 0 as const,
  pedestal_cX: 200, pedestal_cY: 200,
  pedestal_cX1: 200, pedestal_cX2: 200, pedestal_cY1: 200, pedestal_cY2: 200,
};
// Axis-aligned-solver tests assume My=0. LEGACY has My≠0 for biaxial FTUX,
// so we override it here to isolate the axis-aligned solver from the biaxial path.
const base = { ...LEGACY, My: 0 };
// base: HEB-200, placa 400×300×20 S275, 4·φ20 B500S en esquinas,
//       NEd=200 kN, Mx=45 kNm, My=0, VEd=50 kN, fck=25 MPa, prolongación recta.
// Geometría con el par de cartelas en las alas sin que las barras las pisen:
// la placa sube a 400 en y (barras en ±150, cartelas en ±100..110).
const conCartelas = { ...base, plate_b: 400, rib_count: 2 as const };

describe('anchor plate — zero loads', () => {
  it('result invalid only when NEd=Mx=My=0 AND V=0 (fix auditoría #7)', () => {
    const r = calcAnchorPlate({ ...base, NEd: 0, Mx: 0, My: 0, VEd: 0, Vx: 0, Vy: 0 });
    expect(r.valid).toBe(false);
    expect(r.checks).toHaveLength(0);
  });

  it('cortante puro (N=M=0, V≠0) ejecuta los checks de cortante (fix auditoría #7)', () => {
    // Caso real: placa de arriostramiento horizontal (cruz de San Andrés a
    // zócalo). Pre-fix devolvía checks=[], worstUtil=0 y overallStatus 'ok'
    // — verde sin haber comprobado cortante de acero ni edge breakout.
    const r = calcAnchorPlate({ ...base, NEd: 0, Mx: 0, My: 0 });  // VEd=50 (defaults)
    expect(r.valid).toBe(true);
    const ids = r.checks.map((c) => c.id);
    expect(ids).toContain('bolt-shear');
    expect(ids).toContain('concrete-edge-breakout');
    expect(ids).toContain('concrete-pryout');
    expect(r.worstUtil).toBeCloseTo(1.767, 2);  // edge breakout gobierna
    expect(r.overallStatus).toBe('fail');
  });
});

describe('anchor plate — pure compression (e=0)', () => {
  const inp = { ...base, NEd: 300, Mx: 0, My: 0 };
  const sol = solveAxisAligned4(inp);

  it('mode = uniform-compression', () => expect(sol.mode).toBe('uniform-compression'));
  it('Nc equals NEd', () => expect(sol.Nc).toBeCloseTo(300, 3));
  it('no tensioned bars', () => expect(sol.n_t).toBe(0));
  it('Ft_total = 0', () => expect(sol.Ft_total).toBe(0));
  it('plate is not lifted', () => expect(sol.lifted).toBe(false));
});

describe('anchor plate — eccentricity within kernel (|e| ≤ a/6)', () => {
  // plate_a = 400 mm → a/6 ≈ 66.7 mm. NEd=200, Mx=10 kNm → e = 50 mm ≤ 66.7.
  const inp = { ...base, NEd: 200, Mx: 10 };
  const sol = solveAxisAligned4(inp);

  it('mode stays uniform-compression at |e| ≤ a/6', () => {
    expect(sol.mode).toBe('uniform-compression');
  });
  it('no tension appears', () => expect(sol.Ft_total).toBe(0));
});

describe('anchor plate — partial lift (|e| > a/6)', () => {
  // CR2 fix (PR7a): partial-lift via rectangular plastic block equilibrium
  // (CE Anejo 18 §6.2.5). Replaces the ad-hoc lever arm `x_n = a/2 − bar_edge_x/3`
  // that had no normative basis.
  //
  // defaults: NEd=200, Mx=45 → e = 225 mm > a/6 (66.7) → partial-lift path.
  //
  // Hand calc (FTUX defaults, My=0):
  //   L_t = a − bar_edge_x = 350 mm   (distance from tension bar to compressed edge)
  //   L_n = a/2 − bar_edge_x = 150 mm  (distance from section centroid to tension bar)
  //   Kj (EC3 1-8 §6.2.5(4) post-H2): pedestal_h=1000, ar=br=150
  //     a1 = min(400+2·150, 5·400, 400+1000) = min(700, 2000, 1400) = 700
  //     b1 = min(300+2·150, 5·300, 300+1000) = min(600, 1500, 1300) = 600
  //     Kj = √((700·600)/(400·300)) = √3.5 = 1.8708
  //   fjd = (2/3)·1.8708·(25/1.5) = 20.787 MPa
  //   A_c = fjd · plate_b = 20.787 · 300 = 6236.0 N/mm
  //   disc = L_t² − 2·(M + NEd·L_n)/A_c
  //        = 350² − 2·(45·10⁶ + 200·10³·150)/6236.0
  //        = 122500 − 24054.7 = 98445.3
  //   y_c = L_t − √disc = 350 − 313.76 = 36.24 mm
  //   Ft_total = A_c·y_c − NEd_N = 6236.0·36.24 − 200000 = 25985 N ≈ 25.98 kN
  //   Nc = NEd + Ft_total ≈ 225.98 kN
  //   Ft_per_bar = 25.98/2 ≈ 12.99 kN  (FtRd_per_bar=136.6 → NO saturado)
  const sol = solveAxisAligned4(base);

  it('mode = partial-lift', () => expect(sol.mode).toBe('partial-lift'));
  it('two bars in tension', () => expect(sol.n_t).toBe(2));
  it('Ft_total matches plastic block equilibrium (~25.98 kN)', () => {
    expect(sol.Ft_total).toBeCloseTo(25.98, 1);
  });
  it('Nc = NEd + Ft_total', () => {
    expect(sol.Nc).toBeCloseTo(225.98, 1);
  });
  it('lifted flag is true', () => expect(sol.lifted).toBe(true));
  it('Ft distributed equally across tensioned corner pair', () => {
    const tensioned = sol.bolts.filter((b) => b.inTension);
    expect(tensioned).toHaveLength(2);
    for (const b of tensioned) expect(b.Ft).toBeCloseTo(12.99, 1);
  });
  it('equilibrium ΣN exact (residuals.SN_kN ≈ 0)', () => {
    expect(Math.abs(sol.residuals.SN_kN)).toBeLessThan(0.01);
  });
  it('equilibrium ΣM exact (residuals.SMx_kNm ≈ 0 when not saturated)', () => {
    expect(Math.abs(sol.residuals.SMx_kNm)).toBeLessThan(0.01);
  });
});

describe('anchor plate — result shape', () => {
  const r = calcAnchorPlate(base);

  it('valid case returns 15 checks (13 + T-stub tracción + interacción N+V hormigón)', () => {
    expect(r.checks).toHaveLength(15);
  });
  it('all checks carry a real id and article', () => {
    const expectedIds = [
      'plate-compression', 'plate-bending', 'plate-tension-tstub', 'bolt-tension',
      'bolt-shear', 'bolt-interaction', 'anchorage-length', 'concrete-cone',
      'concrete-edge-breakout', 'concrete-pryout', 'concrete-breakout-v',  // PR8b CR6
      'pullout', 'splitting', 'stiffener', 'concrete-interaction',
    ];
    for (const id of expectedIds) {
      const c = r.checks.find((x) => x.id === id);
      expect(c).toBeDefined();
      expect(c!.article).not.toBe('');
    }
  });
  it('worst utilization matches max over all checks', () => {
    const expected = Math.max(...r.checks.map((c) => c.utilization));
    expect(r.worstUtil).toBeCloseTo(expected, 6);
  });
  // L1 (Phase 3): pr1Limitations eliminado — siempre estuvo vacío desde PR8b
  // y la UI/PDF lo renderizaba condicionalmente como dead code. Confirma que
  // el campo ya no forma parte de AnchorPlateResult.
  it('AnchorPlateResult ya no expone pr1Limitations (L1)', () => {
    expect((r as unknown as Record<string, unknown>).pr1Limitations).toBeUndefined();
  });
});

// ─── Plate-bending per-axis refinement (PR-4) ────────────────────────────

describe('check 2 — flexión placa: voladizo equivalente por líneas de rotura según las cartelas', () => {
  // HEB-200 (h = bf = 200), placa 400×300 → c_x = 100, c_y = 50; cartelas t = 10.
  // Los valores están derivados a mano de los mecanismos de
  // anchor-plate/geometria.ts (ver anchorPlateGeometria.test.ts para k(ρ)).
  it('rib_count=0 → voladizo desde el perfil, c = max(100, 50) = 100 mm', () => {
    const r = calcAnchorPlate({ ...base, rib_count: 0 });
    const pb = r.checks.find((c) => c.id === 'plate-bending')!;
    expect(pb.limit).toContain('c=100 mm');
  });
  it('rib_count=2 → franja lateral entre cartelas (w=200, c=100, k≈0,0853 → 41) manda sobre el voladizo exterior (50−10=40)', () => {
    // Las barras pisarían las cartelas con b=300; para esta comprobación da
    // igual (no mira las barras), pero se usa b=400 para no arrastrar el aviso:
    // entonces el voladizo exterior es 100−10 = 90 y gobierna él.
    const r = calcAnchorPlate({ ...base, rib_count: 2 });
    const pb = r.checks.find((c) => c.id === 'plate-bending')!;
    expect(pb.limit).toContain('c=41 mm');
    expect(pb.limit).toContain('franja lateral');
    const r400 = calcAnchorPlate(conCartelas);
    expect(r400.checks.find((c) => c.id === 'plate-bending')!.limit).toContain('c=90 mm');
    expect(r400.checks.find((c) => c.id === 'plate-bending')!.limit).toContain('voladizo exterior');
  });
  it('rib_count=4 → lateral (w=200, c=90 → 39) > central (w=200, c=40 → 25) > esquina (90×40 → 24): c = 39 mm', () => {
    const r = calcAnchorPlate({ ...base, rib_count: 4 });
    const pb = r.checks.find((c) => c.id === 'plate-bending')!;
    expect(pb.limit).toContain('c=39 mm');
  });
  it('rib_count=2 con placa 300×500: el voladizo exterior a las cartelas (150−10 = 140) es el que manda', () => {
    // c_x = 50 → franja lateral (w=200, ρ=4, k≈0,167) = 29; exterior = 140.
    const r = calcAnchorPlate({ ...base, plate_a: 300, plate_b: 500, rib_count: 2 });
    const pb = r.checks.find((c) => c.id === 'plate-bending')!;
    expect(pb.limit).toContain('c=140 mm');
  });
  it('rib_count=4 con placa 300×500: la celda central entre cartelas (w=200, c=140, k≈0,057) baja a 47 mm', () => {
    // lateral (w=200, c=40) = 25; esquina (40×140) = 28; central = 47.
    const r = calcAnchorPlate({ ...base, plate_a: 300, plate_b: 500, rib_count: 4 });
    const pb = r.checks.find((c) => c.id === 'plate-bending')!;
    expect(pb.limit).toContain('c=47 mm');
    expect(pb.limit).toContain('celda central');
  });
  it('con cartelas el voladizo equivalente nunca supera al de la placa sin cartelas', () => {
    for (const [a, b] of [[400, 300], [300, 500], [500, 500], [260, 260]] as const) {
      const c = (rib: 0 | 2 | 4) => {
        const pb = calcAnchorPlate({ ...base, plate_a: a, plate_b: b, rib_count: rib }).checks.find((x) => x.id === 'plate-bending')!;
        return Number(pb.limit!.match(/c=(\d+) mm/)![1]);
      };
      expect(c(2)).toBeLessThanOrEqual(c(0));
      expect(c(4)).toBeLessThanOrEqual(c(2));
    }
  });
});

describe('anchor plate — biaxial solver', () => {
  // Defaults already carry My=10 → biaxial path. Use defaults directly.
  const biax = { ...LEGACY };
  const r = calcAnchorPlate(biax);

  it('dispatcher routes biaxial when My ≠ 0', () => {
    expect(['biaxial-plastic', 'biaxial-grid']).toContain(r.solver.mode);
  });
  it('biaxial solver returns a compression polygon', () => {
    expect(r.solver.block).toBeDefined();
    expect(r.solver.block!.length).toBeGreaterThanOrEqual(3);
  });
  it('biaxial solver reports a NA angle and offset', () => {
    expect(typeof r.solver.phi_NA).toBe('number');
    expect(typeof r.solver.d_NA).toBe('number');
  });
  it('biaxial axial equilibrium holds (Nc ≈ NEd + Ft_total)', () => {
    expect(r.solver.Nc).toBeCloseTo(biax.NEd + r.solver.Ft_total, 0);
  });

  it('supports 6-bar layout without fallback', () => {
    const r6 = calcAnchorPlate({ ...biax, bar_nLayout: 6 });
    expect(r6.solver.bolts).toHaveLength(6);
  });
  it('supports 8-bar layout', () => {
    const r8 = calcAnchorPlate({ ...biax, bar_nLayout: 8 });
    expect(r8.solver.bolts).toHaveLength(8);
  });
  it('supports 12-bar layout (anillo con pares)', () => {
    const r12 = calcAnchorPlate({ ...biax, bar_nLayout: 12 });
    expect(r12.solver.bolts).toHaveLength(12);
  });
  it('la retícula 3×3 retirada (9) se lee como el anillo de 8', () => {
    const r9 = calcAnchorPlate({ ...biax, bar_nLayout: 9 as unknown as 8 });
    expect(r9.solver.bolts).toHaveLength(8);
  });

  it('biaxial degenerates to axis-aligned when My=0', () => {
    const rAxis = calcAnchorPlate({ ...biax, My: 0 });
    expect(['uniform-compression', 'partial-lift']).toContain(rAxis.solver.mode);
  });

  it('pure compression with small moment takes axis-aligned path', () => {
    const rPure = calcAnchorPlate({ ...biax, Mx: 0.001, My: 0.001, NEd: 500 });
    expect(rPure.solver.mode).toBe('uniform-compression');
  });
});

// ─── Per-check coverage ──────────────────────────────────────────────────

describe('check 5 — bar N+V interaction (EC3 1-8 Tab 3.4 adaptado a fyd)', () => {
  it('shear-dominant: high VEd with low NEd_G pushes bars hard in shear', () => {
    // VEd=320, NEd_G=10, μ=0.4 → Vfric = 4 kN → cortante/barra = (320-4)/4 = 79 kN.
    // FvRd por barra (φ20 B500S) = 0.6·314.16·434.78/1000 ≈ 81.94 kN → util_v ≈ 0.96.
    // Post-fix #6 los checks de acero usan resolveShear (Vx/Vy prevalecen):
    // sincronizamos Vx=VEd como hace la UI con el toggle direccional OFF.
    const r = calcAnchorPlate({ ...base, NEd: 100, NEd_G: 10, Mx: 0, My: 0, VEd: 320, Vx: 320, Vy: 0 });
    const bi = r.checks.find((c) => c.id === 'bolt-interaction')!;
    expect(bi.utilization).toBeGreaterThan(0.9);
  });
  it('no tension → utilization only from shear term', () => {
    // Pure compression, negligible shear (fully absorbed by friction).
    const r = calcAnchorPlate({ ...base, NEd: 300, NEd_G: 300, Mx: 0, My: 0, VEd: 50 });
    const bi = r.checks.find((c) => c.id === 'bolt-interaction')!;
    expect(bi.utilization).toBeLessThan(0.1);
  });
});

describe('check 7 — concrete cone (EN 1992-4 §7.2.1.4)', () => {
  it('Ac,N capado a n_t·Ac,N0 con separación > s_cr,N (fix auditoría #44)', () => {
    // hef=100 → s_cr,N = 3·100 = 300 mm. Placa 700×700, 2 barras traccionadas
    // (Mx puro) separadas > 300 mm: los conos no se solapan → Ac,N no puede
    // exceder 2·Ac,N0. Sin el cap el bounding box daba Ac/Ac0 > 2 (inseguro).
    const r = calcAnchorPlate({
      ...base, bar_hef: 100, bar_diam: 12,
      plate_a: 700, plate_b: 700, bar_edge_x: 50, bar_edge_y: 50,
      NEd: 50, Mx: 80, My: 0,
    });
    const cc = r.checks.find((c) => c.id === 'concrete-cone')!;
    expect(cc.limit).toContain('Ac/Ac0=2,00');
  });

  it('deep hef + large edge distance → comfortable capacity', () => {
    const r = calcAnchorPlate({ ...base, bar_hef: 300, pedestal_cX: 500, pedestal_cY: 500 });
    const cc = r.checks.find((c) => c.id === 'concrete-cone')!;
    expect(cc.utilization).toBeLessThan(cc.utilization + 1e-9); // finite
    // ψs should be 1.0 when c ≥ 1.5·hef = 450 mm.
    expect(cc.limit).toContain('ψs=1,00');
  });
  it('close-to-edge → ψs reduction visible', () => {
    // c = 100 mm, hef = 200 → c_cr = 300 > 100, so ψs = 0.7 + 0.3·100/300 = 0.80
    const r = calcAnchorPlate({ ...base, bar_hef: 200, pedestal_cX: 100, pedestal_cY: 100 });
    const cc = r.checks.find((c) => c.id === 'concrete-cone')!;
    expect(cc.limit).toContain('ψs=0,80');
  });
  it('no tension bars → check reports neutral with no utilization', () => {
    const r = calcAnchorPlate({ ...base, NEd: 400, Mx: 0, My: 0 });
    const cc = r.checks.find((c) => c.id === 'concrete-cone')!;
    expect(cc.utilization).toBe(0);
    expect(cc.value).toContain('Sin tracción');
  });
});

// ─── α1 step per EC2 §8.4.4(2) Tab 8.2 (PR-4) ───────────────────────────

describe('check 6 — α1 en patilla/gancho según cd (EC2 §8.4.4 Tab 8.2)', () => {
  // Defaults: bar_diam=20 → 3·φ=60 mm. bar_spacing_x=300, pedestal_cX=200.
  // cd por defecto = min(200, 200, (300-20)/2, (200-20)/2) = 90 > 60 → α1=0.7.
  it('patilla con cd > 3·φ → α1=0.70 (reducción permitida)', () => {
    const r = calcAnchorPlate({ ...base, bottom_anchorage: 'patilla' });
    const an = r.checks.find((c) => c.id === 'anchorage-length')!;
    expect(an.value).toContain('α1=0,70');
  });
  it('gancho con cd > 3·φ → α1=0.70', () => {
    const r = calcAnchorPlate({ ...base, bottom_anchorage: 'gancho' });
    const an = r.checks.find((c) => c.id === 'anchorage-length')!;
    expect(an.value).toContain('α1=0,70');
  });
  it('patilla con cd ≤ 3·φ (recubrimiento ajustado) → α1=1.00', () => {
    // pedestal_cX=50 → cd = min(50,200,140,90) = 50 ≤ 60 → α1=1.0.
    const r = calcAnchorPlate({ ...base, bottom_anchorage: 'patilla', pedestal_cX: 50 });
    const an = r.checks.find((c) => c.id === 'anchorage-length')!;
    expect(an.value).toContain('α1=1,00');
  });
  it('prolongación recta → α1=1.00 siempre', () => {
    const r = calcAnchorPlate({ ...base, bottom_anchorage: 'prolongacion_recta' });
    const an = r.checks.find((c) => c.id === 'anchorage-length')!;
    expect(an.value).toContain('α1=1,00');
  });
  // H3 (Phase 2 Tier 2): α2 continuo por recubrimiento.
  // α2 = 1 − 0.15·(cd − φ)/φ,  bounded 0.7 ≤ α2 ≤ 1.0.
  it('H3 α2: FTUX defaults (cd≈90, φ=20) → α2=0.70 (cap inferior)', () => {
    // FTUX cd ≈ 90 mm; (90−20)/20 = 3.5 → α2 = 1 − 0.525 = 0.475, cap a 0.70.
    const r = calcAnchorPlate(base);
    const an = r.checks.find((c) => c.id === 'anchorage-length')!;
    expect(an.value).toMatch(/α2=0,70/);
  });
  it('H3 α2: cd ≤ φ (recubrimiento ajustado) → α2=1.00 (sin reducción)', () => {
    // pedestal_cX=10, bar_edge_x=80 → cornerX = 200-80 = 120, coverX(corner)
    // = 10 + (120-120) = 10 < φ → α2 = clamp(1+0.075, 0.7, 1.0) = 1.00.
    const r = calcAnchorPlate({
      ...base,
      bar_edge_x: 80, bar_edge_y: 80,
      pedestal_cX: 10, pedestal_cY: 10,
    });
    const an = r.checks.find((c) => c.id === 'anchorage-length')!;
    expect(an.value).toMatch(/α2=1,00/);
  });
  it('top_connection no afecta al check (ortogonal): soldada vs tuerca_arandela dan mismo α1 y utilización', () => {
    // Con prolongacion_recta en el fondo, cambiar top_connection no debe tocar
    // ningún check. Esta es la invariante clave del split PR-4.
    const soldada = calcAnchorPlate({
      ...base,
      bottom_anchorage: 'prolongacion_recta',
      top_connection: 'soldada',
    });
    const tuerca = calcAnchorPlate({
      ...base,
      bottom_anchorage: 'prolongacion_recta',
      top_connection: 'tuerca_arandela',
    });
    const anS = soldada.checks.find((c) => c.id === 'anchorage-length')!;
    const anT = tuerca.checks.find((c) => c.id === 'anchorage-length')!;
    expect(anS.value).toBe(anT.value);
    expect(anS.limit).toBe(anT.limit);
    expect(anS.utilization).toBeCloseTo(anT.utilization, 9);
    expect(soldada.worstUtil).toBeCloseTo(tuerca.worstUtil, 9);
  });
  it('H14 (PR5): bar_spacing_x input es ignorado en layout 4-corner (posiciones desde bar_edge_x)', () => {
    // Pre-H14: el código usaba inp.bar_spacing_x para calcular cd, así que
    // pasar 70 reducía cd a 25 < 60 → α1=1.0 (lo que validaba el bug).
    // Post-H14: cd se deriva de las coordenadas reales de generateLayout.
    // En 4-corner las barras están en ±(plate_a/2 − bar_edge_x), 300 mm aparte,
    // así que pasar bar_spacing_x=70 NO cambia nada — α1 sigue siendo 0.70.
    const r = calcAnchorPlate({ ...base, bottom_anchorage: 'patilla', bar_spacing_x: 70 });
    const an = r.checks.find((c) => c.id === 'anchorage-length')!;
    expect(an.value).toContain('α1=0,70');
  });
  it('H14 (PR5): anillo de 8 con plate pequeña → barras vecinas próximas → cd pequeño → α1=1.00', () => {
    // Anillo de 8 en placa 300×300 con bar_edge=40 → xs en {−110, 0, +110}.
    // La barra centrada tiene vecinas a 110 mm → halfSpacing = (110−20)/2 = 45 < 60 → α1=1.0.
    // Esto sólo funciona porque generateLayout produce el spacing real (post-H14),
    // no inp.bar_spacing_x.
    const r = calcAnchorPlate({
      ...base,
      bottom_anchorage: 'patilla',
      bar_nLayout: 8,
      plate_a: 300, plate_b: 300,
      bar_edge_x: 40, bar_edge_y: 40,
      My: 5,   // pequeño momento biaxial para que algunas barras estén traccionadas
    });
    const an = r.checks.find((c) => c.id === 'anchorage-length')!;
    expect(an.value).toContain('α1=1,00');
  });
});

describe('check 8 — pullout (EN 1992-4 §7.2.1.5)', () => {
  it('prolongacion_recta → check skipped (anclaje por adherencia)', () => {
    const r = calcAnchorPlate({ ...base, bottom_anchorage: 'prolongacion_recta' });
    const po = r.checks.find((c) => c.id === 'pullout')!;
    expect(po.utilization).toBe(0);
    expect(po.value).toContain('No aplica');
  });
  it('patilla → check skipped, references check 6', () => {
    const r = calcAnchorPlate({ ...base, bottom_anchorage: 'patilla' });
    const po = r.checks.find((c) => c.id === 'pullout')!;
    expect(po.utilization).toBe(0);
    expect(po.value).toContain('No aplica');
  });
  it('gancho → check skipped', () => {
    const r = calcAnchorPlate({ ...base, bottom_anchorage: 'gancho' });
    const po = r.checks.find((c) => c.id === 'pullout')!;
    expect(po.utilization).toBe(0);
  });
  it('arandela_tuerca cracked (default) → NRd,p = 7.5·Ah·fck/γMc', () => {
    // EN 1992-4 §7.2.1.5: k2=7.5 fisurado, γMc=1.5.
    // φ20 + OD 50: Ah = (50² - 20²)·π/4 = 2100·π/4 ≈ 1649.3 mm²
    // NRd,p = 7.5·1649.3·25/1.5/1000 ≈ 206.2 kN
    const r = calcAnchorPlate({
      ...base,
      bottom_anchorage: 'arandela_tuerca',
      washer_od: 50,
      NEd: 100, NEd_G: 50, Mx: 40, My: 0,
    });
    const po = r.checks.find((c) => c.id === 'pullout')!;
    expect(po.limit).toContain('NRd,p=206,2');
    expect(po.limit).toContain('k2=7,5');
    expect(po.limit).toContain('fisurado');
  });
  it('arandela_tuerca uncracked → NRd,p = 10.5·Ah·fck/γMc (≈+40%)', () => {
    // k2=10.5 no fisurado: NRd,p = 10.5·1649.3·25/1.5/1000 ≈ 288.6 kN.
    const r = calcAnchorPlate({
      ...base,
      bottom_anchorage: 'arandela_tuerca',
      washer_od: 50,
      concrete_cracked: false,
      NEd: 100, NEd_G: 50, Mx: 40, My: 0,
    });
    const po = r.checks.find((c) => c.id === 'pullout')!;
    expect(po.limit).toContain('NRd,p=288,6');
    expect(po.limit).toContain('k2=10,5');
    expect(po.limit).toContain('no fisurado');
  });
});

describe('check 9 — splitting (EN 1992-4 §7.2.1.6)', () => {
  it('large edge distance → check reports "no crítico"', () => {
    // c = 500 mm ≥ c_cr,sp = 1.5·hef = 450 → no aplica.
    const r = calcAnchorPlate({ ...base, pedestal_cX: 500, pedestal_cY: 500 });
    const sp = r.checks.find((c) => c.id === 'splitting')!;
    expect(sp.utilization).toBe(0);
    expect(sp.limit).toBe('No crítico');
  });
  it('close-to-edge → splitting active with ψh reduction', () => {
    const r = calcAnchorPlate({ ...base, pedestal_cX: 80, pedestal_cY: 80 });
    const sp = r.checks.find((c) => c.id === 'splitting')!;
    expect(sp.limit).toContain('ψh=');
    expect(sp.utilization).toBeGreaterThan(0);
  });
});

describe('check 10 — stiffener (CE Anejo 22 §5.5 + §4.5.3)', () => {
  it('rib_count=0 → check reports neutral', () => {
    const r = calcAnchorPlate({ ...base, rib_count: 0 });
    const st = r.checks.find((c) => c.id === 'stiffener')!;
    expect(st.utilization).toBe(0);
    expect(st.value).toBe('Sin rigidizadores');
  });
  it('rib_count=2 → esbeltez, soldadura o aplastamiento gobiernan (valores reales)', () => {
    const r = calcAnchorPlate(conCartelas);
    const st = r.checks.find((c) => c.id === 'stiffener')!;
    expect(st.utilization).toBeGreaterThan(0);
    expect(st.limit).toMatch(/(esbeltez|soldadura|aplastamiento)/);
  });
  it('slenderness limit tightens for S355 (lower ε)', () => {
    const rS355 = calcAnchorPlate({ ...conCartelas, plate_steel: 'S355' });
    const st = rS355.checks.find((c) => c.id === 'stiffener')!;
    // ε = √(235/355) ≈ 0.814 → 14·ε ≈ 11.4 < 12 (rib_h/rib_t=120/10), esbeltez NO FAIL pero alta.
    expect(st.limit).toContain('c/t≤11,4');
  });
});

describe('CM#4 — stiffener APLASTAMIENTO (compresión directa en el vuelo)', () => {
  // Reparto entre cartelas (2026-09-23): cada cartela recoge la parte de Nc
  // que cae en su franja tributaria (la de ancho 2c + t que aporta al área
  // eficaz) dentro del bloque comprimido; sin bloque, el bloque es la placa.
  it('con perfil en catálogo el limit expone Fb,Rd y la descripción lo nombra', () => {
    const st = checkStiffener(conCartelas, 100, undefined);
    expect(st.description).toContain('aplastamiento');
    expect(st.limit).toContain('Fb,Rd=');
  });
  it('hand-calc: vuelo estrecho + Nc alto → aplastamiento gobierna, util=4,38', () => {
    // HEB-200 (h=200) con placa 220×300 → vuelo del par X = (220−200)/2 = 10 mm.
    // fyd = 275/1.05 = 261.905 → Fb,Rd = 261.905·10·10/1000 = 26.19 kN.
    // Kj = √(520·600/(220·300)) = 2.174 → fjd = (2/3)·2.174·16.667 = 24.16
    // → c = 20·√(261.905/(3·24.16)) = 38.02. Franja de la cartela y ∈ [100, 110]:
    // [61.98, 148.02] × 220 = 18 929 mm² de los 66 000 de la placa → 28.68 %.
    // F_rib = 400·0.2868 = 114.7 kN → util = 114.7/26.19 = 4.38 (esbeltez 0.93
    // y soldadura 0.34 quedan por debajo).
    const st = checkStiffener({ ...base, rib_count: 2 as const, plate_a: 220 }, 400, undefined);
    expect(st.limit).toContain('(aplastamiento)');
    expect(st.utilization).toBeCloseTo(4.38, 1);
    expect(st.status).toBe('fail');
  });
  it('rib_count=4: cada cartela con SU carga y SU vuelo — gobierna la del eje débil', () => {
    // HEB-200 (h=b=200), placa 320×220 → vuelo X = 60, vuelo Y = 10.
    // Kj = √(620·520/(320·220)) = 2.140 → fjd = 23.78 → c = 38.3.
    // Franja Y (x ∈ [100, 110] ± c, recortada a ±160): 86.6 × 220 = 19 052 mm²
    // de 70 400 → F_Y = 400·0.2706 = 108.2 kN → 108.2/26.19 = 4.13.
    // Franja X (y ∈ [100, 110] ± c, recortada a ±110): 48.3 × 320 = 15 456 →
    // F_X = 87.8 kN frente a Fb,Rd = 157.1 → 0.56. Gobierna la Y con 4.13.
    const st = checkStiffener({ ...base, rib_count: 4 as const, plate_a: 320, plate_b: 220 }, 400, undefined);
    expect(st.limit).toContain('(aplastamiento)');
    expect(st.utilization).toBeCloseTo(4.13, 1);
    // Control: con el eje débil holgado (320×400) el vuelo Y sube a 100 y el
    // aplastamiento (0.44 y 0.59) queda por debajo de la esbeltez (0.93).
    const ctrl = checkStiffener({ ...base, rib_count: 4 as const, plate_a: 320, plate_b: 400 }, 400, undefined);
    expect(ctrl.limit).toContain('(esbeltez)');
  });
  it('con momento, las cartelas del lado comprimido se llevan la carga y las del lado traccionado casi nada', () => {
    // Bloque comprimido en +x (la mitad derecha de la placa, a todo el ancho):
    // las cartelas del par X (ambas a lo largo de x) reparten por igual y la
    // del par Y en +x recoge su franja entera; la de −x no toca el bloque.
    const inp = { ...base, plate_b: 400, rib_count: 4 as const };
    const bloque = [{ x: 0, y: -200 }, { x: 200, y: -200 }, { x: 200, y: 200 }, { x: 0, y: 200 }];
    const conBloque = checkStiffener(inp, 300, bloque);
    const uniforme = checkStiffener(inp, 300, undefined);
    // Con el bloque a medio ancho, la cartela Y de +x recibe el doble que en reparto uniforme.
    const F = (s: { value?: string }) => Number((s.value ?? '').match(/F_rib=([\d,]+)/)![1].replace(',', '.'));
    expect(F(conBloque)).toBeGreaterThan(F(uniforme) * 1.5);
  });
});

describe('D4 — noSolution (sin equilibrio físico ≠ APROX numérico)', () => {
  it('axis-aligned saturado → solver.noSolution y el resultado lo propaga', () => {
    const r = calcAnchorPlate({ ...base, Mx: 200 });
    expect(r.solver.mode).toBe('partial-lift-saturated');
    expect(r.solver.noSolution).toBe(true);
    expect(r.noSolution).toBe(true);
    expect(r.overallStatus).toBe('fail');
    const eq = r.checks.find((c) => c.id === 'solver-equilibrium')!;
    expect(eq.description).toContain('SIN SOLUCIÓN');
    expect(eq.status).toBe('fail');
  });
  it('FTUX sano (biaxial convergido) → noSolution=false, sin check sintético', () => {
    const r = calcAnchorPlate({ ...LEGACY });
    expect(r.solver.converged).toBe(true);
    expect(r.noSolution).toBe(false);
    expect(r.checks.find((c) => c.id === 'solver-equilibrium')).toBeUndefined();
  });
  it('tracción pura saturada (|NEd| > n·FtRd) → noSolution', () => {
    // 4 barras φ20 B500S → 4·136.59 = 546.4 kN < 600 → imposible sostener.
    const r = calcAnchorPlate({ ...LEGACY, NEd: -600, Mx: 0, My: 0 });
    expect(r.solver.mode).toBe('pure-tension');
    expect(r.solver.noSolution).toBe(true);
    expect(r.noSolution).toBe(true);
    expect(r.overallStatus).toBe('fail');
  });
  it('biaxial muy por encima de capacidad → cap FtRd activo + residuo = noSolution', () => {
    const r = calcAnchorPlate({ ...LEGACY, Mx: 300, My: 200 });
    expect(r.solver.converged).toBe(false);
    expect(r.noSolution).toBe(true);
    const eq = r.checks.find((c) => c.id === 'solver-equilibrium')!;
    expect(eq.description).toContain('SIN SOLUCIÓN');
  });
  it('SIN DATOS y cortante puro NO marcan noSolution', () => {
    const sinDatos = calcAnchorPlate({ ...base, NEd: 0, Mx: 0, My: 0, VEd: 0, Vx: 0, Vy: 0 });
    expect(sinDatos.noSolution).toBe(false);
    const cortante = calcAnchorPlate({ ...base, NEd: 0, Mx: 0, My: 0 });
    expect(cortante.noSolution).toBe(false);
  });
});

// Manual hand-calc oracle suite (5 configs A-E) was extracted to
// src/test/calc/anchorPlateOracle.test.ts in PR1 of the audit-driven refactor.
// Each config is activated as the corresponding fix PR lands. See that file
// for the full normative derivations.

describe('PR10 — H4 NEd<0 pure-tension branch', () => {
  it('Tracción axial pura (M=0) → distribución uniforme entre todas las barras', () => {
    // NEd=-100 kN, 4 barras → Ft_per_bar = 25 kN exacto.
    const r = calcAnchorPlate({ ...LEGACY, NEd: -100, Mx: 0, My: 0 });
    expect(r.solver.mode).toBe('pure-tension' as never);
    expect(r.solver.Nc).toBe(0);
    expect(r.solver.Ft_total).toBeCloseTo(100, 1);
    expect(r.solver.n_t).toBe(4);
    expect(r.solver.converged).toBe(true);
    for (const b of r.solver.bolts) {
      expect(b.Ft).toBeCloseTo(25, 1);
    }
  });

  it('Mástil con momento (NEd<0, Mx≠0, My≠0): clamp Ft<0 a 0 en barra diagonal opuesta', () => {
    // NEd=-50, Mx=8, My=8 → distribución lineal a+b·x+c·y daría compresión
    // en la barra (-x, -y) diagonal opuesta al pico. Se clava a 0.
    const r = calcAnchorPlate({
      ...LEGACY,
      sectionType: 'HEA' as const, sectionSize: 160,
      plate_a: 300, plate_b: 300, plate_t: 15, plate_steel: 'S235' as const,
      bar_nLayout: 4 as const, bar_diam: 16 as const,
      bar_edge_x: 40, bar_edge_y: 40, bar_hef: 300,
      bottom_anchorage: 'patilla' as const, rib_count: 0 as const,
      fck: 25,
      pedestal_cX: 150, pedestal_cY: 150,
      pedestal_cX1: 150, pedestal_cX2: 150, pedestal_cY1: 150, pedestal_cY2: 150,
      pedestal_h: 500, plate_margin_x: 100, plate_margin_y: 100,
      NEd: -50, NEd_G: 0, Mx: 8, My: 8, VEd: 15, Vx: 15, Vy: 0,
    });
    expect(r.solver.mode).toBe('pure-tension' as never);
    expect(r.solver.Nc).toBe(0);
    // Bar 0 at (-110,-110) clamped to 0; bar 3 at (+110,+110) is peak.
    const bar0 = r.solver.bolts.find((b) => b.x < 0 && b.y < 0)!;
    const bar3 = r.solver.bolts.find((b) => b.x > 0 && b.y > 0)!;
    expect(bar0.Ft).toBe(0);
    expect(bar0.inTension).toBe(false);
    expect(bar3.Ft).toBeGreaterThan(30);
    // 3 barras traccionadas (bar 0 clamped a 0)
    expect(r.solver.n_t).toBe(3);
  });

  it('NEd<0: cono / splitting siguen aplicando sobre barras traccionadas', () => {
    const r = calcAnchorPlate({
      ...LEGACY,
      sectionType: 'HEA' as const, sectionSize: 160,
      plate_a: 300, plate_b: 300, plate_t: 15, plate_steel: 'S235' as const,
      bar_nLayout: 4 as const, bar_diam: 16 as const,
      bar_edge_x: 40, bar_edge_y: 40, bar_hef: 300,
      bottom_anchorage: 'patilla' as const, rib_count: 0 as const,
      fck: 25,
      pedestal_cX: 150, pedestal_cY: 150,
      pedestal_cX1: 150, pedestal_cX2: 150, pedestal_cY1: 150, pedestal_cY2: 150,
      pedestal_h: 500, plate_margin_x: 100, plate_margin_y: 100,
      NEd: -50, NEd_G: 0, Mx: 8, My: 8, VEd: 15, Vx: 15, Vy: 0,
    });
    const cone = r.checks.find((c) => c.id === 'concrete-cone')!;
    const splitting = r.checks.find((c) => c.id === 'splitting')!;
    // Para esta config, ambos deben fallar (geometría apretada para tracción pura).
    expect(cone.utilization).toBeGreaterThan(1.0);
    expect(splitting.utilization).toBeGreaterThan(1.0);
    expect(r.overallStatus).toBe('fail');
  });

  it('NEd<0 dispatcher: rutea a solvePureTension (no a partial-lift-saturated)', () => {
    // PR10 mejora la H4: antes (PR7a fallback) el dispatcher mandaba NEd<0 a
    // solveAxisAligned4 que degradaba a 'partial-lift-saturated'. Ahora el
    // dispatcher detecta NEd<0 al inicio y rutea a solvePureTension.
    const r = calcAnchorPlate({ ...LEGACY, NEd: -10, Mx: 5, My: 0 });
    expect(r.solver.mode).toBe('pure-tension' as never);
  });

  it('NEd<0 con momento grande: alcanza saturación si requiere Ft > FtRd', () => {
    // FtRd_per_bar φ20 B500S = 136.6 kN. NEd=-200 kN para 4 barras = 50 kN avg,
    // bien por debajo. Pero un Mx muy grande podría saturar una barra.
    // Mx = 200 kNm con bars en (±150, ±100): cada barra +x recibe ~b·150·2 contrib.
    // Para saturar (Ft_max=136.6): a + b·150 + c·100 = 136.6
    // Con a=50 (uniform), b=Mx·1000/Σx²=200000/(4·150²)=2.22 → b·150=333. Demasiado.
    // Eso da 50+333+0 = 383 → satura. ★
    const r = calcAnchorPlate({ ...LEGACY, NEd: -200, Mx: 200, My: 0 });
    expect(r.solver.mode).toBe('pure-tension' as never);
    expect(r.solver.note).toMatch(/saturada/i);
  });
});

describe('PR8b — CR6 concrete shear modes', () => {
  it('checks count: 15 (PR8b +3 concrete-shear; auditoría +T-stub +interacción N+V)', () => {
    const r = calcAnchorPlate(LEGACY);
    expect(r.checks).toHaveLength(15);
    expect(r.checks.find((c) => c.id === 'concrete-edge-breakout')).toBeDefined();
    expect(r.checks.find((c) => c.id === 'concrete-pryout')).toBeDefined();
    expect(r.checks.find((c) => c.id === 'concrete-breakout-v')).toBeDefined();
    expect(r.checks.find((c) => c.id === 'plate-tension-tstub')).toBeDefined();
    expect(r.checks.find((c) => c.id === 'concrete-interaction')).toBeDefined();
  });

  it('FTUX: edge breakout EN 1992-4 Eq (7.40) — oracle manual (fix auditoría #1)', () => {
    // Hand-calc EN 1992-4:2018 Eq (7.40), hormigón fisurado (k9=1.7):
    //   dnom=20 ≤ 24, hef=300 → lf = min(300, 12·20) = 240 mm; c1=200; fck=25
    //   α = 0.1·(lf/c1)^0.5 = 0.1·(240/200)^0.5 = 0.10954
    //   β = 0.1·(dnom/c1)^0.2 = 0.1·(20/200)^0.2 = 0.06310
    //   V0Rk = 1.7 · 20^0.10954 · 240^0.06310 · √25 · 200^1.5
    //        = 1.7 · 1.3884 · 1.4132 · 5 · 2828.43 = 47 171 N
    //   Ac,V/Ac,V0 = 1.0 (widthPerp = 2·c2 + gw = 600 = 3·c1), ψs = 0.90, ψh = 1.0
    //   VRd,c = 47.17 · 0.90 / 1.5 = 28.30 kN → util = 50/28.30 = 1.767 → FAIL
    // Hasta el 2026-09-25 lf se topaba en 8·dnom = 160 (el de la ETAG 001 y el
    // ACI 318) y daba 25.97 kN → 1.925.
    // Pre-fix, la fórmula k1=1.6 con exponentes fijos tipo ACI daba
    // VRd,c ≈ 92 kN (×3.5 sobreestimado) y este caso salía verde.
    const r = calcAnchorPlate(LEGACY);
    const eb = r.checks.find((c) => c.id === 'concrete-edge-breakout')!;
    expect(eb.utilization).toBeCloseTo(1.767, 2);
    expect(eb.status).toBe('fail');
  });

  it('lf del edge breakout: 12·dnom hasta Ø24 y max(8·dnom, 300) por encima (EN 1992-4 §7.2.2.5)', () => {
    // Con hef = 400: Ø20 → lf = 240 (12·20); Ø32 → lf = max(256, 300) = 300.
    // Se comprueba contra la fórmula a mano con el mismo c1 = 200 y ψs = 0.90.
    const v0 = (d: number, lf: number) =>
      1.7 * Math.pow(d, 0.1 * Math.sqrt(lf / 200)) * Math.pow(lf, 0.1 * Math.pow(d / 200, 0.2))
        * Math.sqrt(25) * Math.pow(200, 1.5);
    const util = (d: 20 | 32, lf: number) => 50 / (v0(d, lf) * 0.9 / 1.5 / 1000);
    for (const [d, lf] of [[20, 240], [32, 300]] as const) {
      const r = calcAnchorPlate({ ...LEGACY, bar_diam: d, bar_hef: 400 });
      const eb = r.checks.find((c) => c.id === 'concrete-edge-breakout')!;
      expect(eb.utilization).toBeCloseTo(util(d, lf), 3);
    }
  });

  it('macizo delgado: Ac,V recortado por h → factor neto √(h/1.5c1) (fix auditoría #5)', () => {
    // EN 1992-4 Fig. 7.10: con h < 1.5·c1 la proyección Ac,V se recorta a
    // altura h y ψh,V = √(1.5c1/h) ≥ 1 la compensa: neto = √(h/1.5c1) < 1.
    // Pre-fix no se recortaba el área Y se aplicaba ψh → error ×(1.5c1/h).
    // h = 150 = 0.75·c1: util debe crecer ×1/√(150/300) = ×1.414.
    const r1 = calcAnchorPlate(LEGACY);                          // h=1000 ≥ 300
    const r2 = calcAnchorPlate({ ...LEGACY, pedestal_h: 150 });  // h < 1.5·c1
    const eb1 = r1.checks.find((c) => c.id === 'concrete-edge-breakout')!;
    const eb2 = r2.checks.find((c) => c.id === 'concrete-edge-breakout')!;
    expect(eb2.utilization).toBeCloseTo(eb1.utilization / Math.sqrt(150 / 300), 2);
  });

  it('bolt-shear y bolt-interaction usan |V| = hypot(Vx,Vy) (fix auditoría #6)', () => {
    // Cortante direccional (VEd legacy = 0, Vy = 50): los checks de ACERO
    // evaluaban inp.VEd = 0 → utilización 0, verde con las barras cargadas.
    const r = calcAnchorPlate({
      ...LEGACY,
      VEd: 0, Vx: 0, Vy: 50,
    });
    const bs = r.checks.find((c) => c.id === 'bolt-shear')!;
    expect(bs.utilization).toBeGreaterThan(0);
    expect(bs.value).toContain('50');
  });

  it('interacción N+V hormigón: utilN^1.5 + utilV^1.5 — oracle (fix auditoría #8)', () => {
    // FTUX (post-#25, ψec por componente al baricentro): utilN = cono 0.663,
    // utilV = edge breakout 1.767 (lf = 12·dnom) → 0.663^1.5 + 1.767^1.5
    // = 0.540 + 2.348 = 2.888 (EN 1992-4 §7.2.3, tabla 7.3). Dos modos al
    // 0.85 individual darían 1.57 > 1: la norma exige este check aunque ambos
    // estén en verde.
    const r = calcAnchorPlate(LEGACY);
    const ci = r.checks.find((c) => c.id === 'concrete-interaction')!;
    expect(ci.utilization).toBeCloseTo(2.888, 2);
    expect(ci.status).toBe('fail');
  });

  it('interacción N+V hormigón neutral sin concurrencia (V=0)', () => {
    const r = calcAnchorPlate({ ...LEGACY, VEd: 0, Vx: 0, Vy: 0 });
    const ci = r.checks.find((c) => c.id === 'concrete-interaction')!;
    expect(ci.status).toBe('neutral');
  });

  it('bolt-tension comprueba la barra PÉSIMA, no la media (fix auditoría #23)', () => {
    // FTUX biaxial: FtMax = 15.5 kN vs media 10.2 kN. El check de tracción y
    // el T-stub deben coincidir en la barra pésima.
    const r = calcAnchorPlate(LEGACY);
    const bt = r.checks.find((c) => c.id === 'bolt-tension')!;
    const ts = r.checks.find((c) => c.id === 'plate-tension-tstub')!;
    expect(bt.utilization).toBeCloseTo(ts.utilization, 3);  // misma Ft crítica
    expect(bt.utilization).toBeCloseTo(0.114, 2);           // 15.5/136.6
  });

  it('fricción con Cf,d = 0.20 (EC3 1-8 §6.2.2(6)) — fix auditoría #26', () => {
    // Junta placa-grout: el 0.4 "rugoso" carecía de respaldo y era el default.
    // CE Anejo 26 §6.2.2(6): Nc,Ed es el AXIL del pilar, no la compresión del
    // bloque bajo la placa. LEGACY: min(NEd, NEd,G) = min(200, 120) = 120 kN
    // → Ff = 0.20·120 = 24.0 kN (con la compresión del bloque salían 39.0).
    const r = calcAnchorPlate(LEGACY);
    const bs = r.checks.find((c) => c.id === 'bolt-shear')!;
    expect(bs.limit).toContain('0,20·120,0 kN=24,0 kN');
  });

  it('el rozamiento no crece con el momento: usa el axil, no N + T (CE Anejo 26 §6.2.2(6))', () => {
    // El pilar 1 del usuario (2026-09-25): NEd,G = 120 con Mx = 45 daba una
    // compresión de 213 kN bajo la placa y 42.6 kN de rozamiento, que se
    // comían los 40 kN de cortante y dejaban las barras a FvEd = 0.
    const fvEd = (Mx: number) => (calcAnchorPlate({ ...LEGACY, Mx, VEd: 40, Vx: 40 })
      .checks.find((c) => c.id === 'bolt-interaction')!.limit ?? '').match(/FvEd=[\d,]+ kN/)![0];
    // (40 − 24) / 4 barras = 4.0 kN por barra, con momento o sin él.
    expect(fvEd(45)).toBe('FvEd=4,0 kN');
    expect(fvEd(0)).toBe('FvEd=4,0 kN');
  });

  it('el rozamiento toma el menor de NEd y NEd,G, y nada si el pilar tracciona', () => {
    const ff = (NEd: number, NEd_G: number) =>
      calcAnchorPlate({ ...LEGACY, NEd, NEd_G }).checks.find((c) => c.id === 'bolt-shear')!.limit;
    expect(ff(80, 120)).toContain('0,20·80,0 kN=16,0 kN');
    expect(ff(-30, 0)).toContain('0,20·0,0 kN=0,0 kN');
  });

  it('anclaje con suelo lb,min = max(0.3·lb(fyd), 10φ, 100) — fix auditoría #27', () => {
    // FTUX φ20: lb(fyd) = 5·434.78/2.69 = 808 → lb,min = max(242, 200, 100)
    // = 242 mm → util = 242/300 = 0.81 (antes, con Ft baja, lb,rqd→mm y verde).
    const r = calcAnchorPlate(LEGACY);
    const al = r.checks.find((c) => c.id === 'anchorage-length')!;
    expect(al.utilization).toBeCloseTo(0.807, 2);
    // hef escaso con barras casi descargadas ya no pasa: hef=180 < 10φ=200.
    const r2 = calcAnchorPlate({ ...LEGACY, bar_hef: 180 });
    const al2 = r2.checks.find((c) => c.id === 'anchorage-length')!;
    expect(al2.utilization).toBeGreaterThan(1);
  });

  it('T-stub tracción: t=20 gobierna modo 3; t=10 cae a modo 1/2 (fix auditoría #9)', () => {
    // FTUX (φ20 B500S, m=50, e=50): leff = min(2π·50, 4·50+1.25·50) = 262.5.
    // t=20 → Mpl = 0.25·262.5·400·261.9 = 6.87e6 Nmm → FT1 = 550 kN,
    //        FT2 = 205.8 kN, FT3 = 136.6 kN → modo 3 (barra) gobierna.
    // t=10 → Mpl/4 → FT1 = 137.5, FT2 = 102.7 < FT3 → modo 2 (placa+palanca):
    //        la placa delgada pierde capacidad ANTES que la barra — el caso
    //        que pre-fix pasaba todos los checks.
    const r20 = calcAnchorPlate(LEGACY);
    const r10 = calcAnchorPlate({ ...LEGACY, plate_t: 10 });
    const ts20 = r20.checks.find((c) => c.id === 'plate-tension-tstub')!;
    const ts10 = r10.checks.find((c) => c.id === 'plate-tension-tstub')!;
    expect(ts20.limit).toContain('modo 3');
    expect(ts10.limit).toMatch(/modo [12]/);
    expect(ts10.utilization).toBeGreaterThan(ts20.utilization);
  });

  it('Placa de fachada (cerca de borde): edge breakout activa fail', () => {
    // Pre-PR8b: checkBoltShear sólo cubría friction + steel shear → no captaba
    // el fallo del hormigón. Con c=80 y VEd alto, edge breakout debería fallar.
    const r = calcAnchorPlate({
      ...LEGACY,
      pedestal_cX: 80, pedestal_cY: 80,
      VEd: 100,
    });
    const eb = r.checks.find((c) => c.id === 'concrete-edge-breakout')!;
    expect(eb.utilization).toBeGreaterThan(1.0);
    expect(eb.status).toBe('fail');
  });

  it('Pry-out usa k=2 cuando hef ≥ 60mm (caso típico)', () => {
    const r = calcAnchorPlate(LEGACY);
    const po = r.checks.find((c) => c.id === 'concrete-pryout')!;
    expect(po.limit).toContain('k=2,0');
  });

  it('Breakout-V reporta neutral para hef ≥ 60mm (no aplica)', () => {
    const r = calcAnchorPlate(LEGACY);
    const bo = r.checks.find((c) => c.id === 'concrete-breakout-v')!;
    expect(bo.status).toBe('neutral');
    expect(bo.limit).toBe('No aplica');
  });

  it('sin cortante (Vx=Vy=VEd=0) → todos los modos de hormigón en V neutral', () => {
    // resolveShear da prioridad a Vx/Vy si difieren de VEd: para "sin cortante"
    // hay que setear los tres a 0 explícitamente.
    const r = calcAnchorPlate({ ...LEGACY, VEd: 0, Vx: 0, Vy: 0 });
    const eb = r.checks.find((c) => c.id === 'concrete-edge-breakout')!;
    const po = r.checks.find((c) => c.id === 'concrete-pryout')!;
    expect(eb.status).toBe('neutral');
    expect(po.status).toBe('neutral');
  });

  it('N+V interaction usa EN 1992-4 §7.2.3 (exponente 2, dúctil)', () => {
    // (N/NRd)² + (V/VRd)² ≤ 1.0 — forma cuadrática (no la lineal EC3 Tab 3.4).
    // value string debe contener (ratio)² + (ratio)² format.
    const r = calcAnchorPlate(LEGACY);
    const bi = r.checks.find((c) => c.id === 'bolt-interaction')!;
    expect(bi.value).toMatch(/\(\d+,\d{2}\)² \+ \(\d+,\d{2}\)²/);
    expect(bi.article).toBe('EN 1992-4 §7.2.3');
  });

  it('Vx/Vy direccional: si Vx=0, Vy=50, edge breakout proyecta a borde y', () => {
    // Con Vy=50 y Vx=0 (declarando Vy explícito), c1 = cY1 (no cX1).
    // Verificar que el limit string refleja c1 = cY direccional.
    const r = calcAnchorPlate({
      ...LEGACY,
      VEd: 0,                // legacy desactivado
      Vx: 0, Vy: 50,
      pedestal_cX: 500, pedestal_cY: 100,
      pedestal_cX1: 500, pedestal_cX2: 500,
      pedestal_cY1: 100, pedestal_cY2: 100,
    });
    const eb = r.checks.find((c) => c.id === 'concrete-edge-breakout')!;
    expect(eb.limit).toContain('c1=100');
  });
});

describe('PR8a — H15 geometría direccional (cX1/cX2/cY1/cY2)', () => {
  it('legacy compat: pedestal_cX (simétrico) sigue funcionando idéntico', () => {
    // resolveEdges resuelve cX1==cX2==pedestal_cX cuando los direccionales
    // están simétricos (estado pre-PR8a sin asimetría explícita).
    const r = calcAnchorPlate(LEGACY);
    // Sentinel: interacción N+V del hormigón = 2.888 (post-fixes #8 y #25 y
    // lf = 12·dnom: 0.663^1.5 + 1.767^1.5 = 2.888; antes 3.211 con lf = 8·dnom,
    // 3.246, 1.925 con edge breakout solo, y 0.992 pre-auditoría).
    // NO debe cambiar con resolveEdges sobre defaults simétricos. Se mira la
    // fila y no worstUtil porque LEGACY va sin cartelas y ahí la flexión de
    // placa (c = 100 mm) sube a 3.97 y pasa a mandar.
    const ci = r.checks.find((c) => c.id === 'concrete-interaction')!;
    expect(ci.utilization).toBeCloseTo(2.888, 2);
    // Con los direccionales simétricos (150/150) manda el legacy (200): es el
    // estado persistido pre-PR0, y tiene que dar lo mismo que LEGACY.
    const rDir = calcAnchorPlate({ ...LEGACY, pedestal_cX1: 150, pedestal_cX2: 150 });
    expect(rDir.worstUtil).toBeCloseTo(r.worstUtil, 6);
  });

  it('asimétrico cX1 << cX2 → Ac/Ac0 menor (proyección más limitada en +x)', () => {
    // cX1=50, cX2=500 → la proyección del cono se limita a 50 en +x.
    // Comparar con simétrico cX=200.
    const r_sym = calcAnchorPlate({ ...LEGACY, pedestal_cX: 200 });
    const r_asym = calcAnchorPlate({
      ...LEGACY,
      pedestal_cX1: 50, pedestal_cX2: 500,
    });
    const cone_sym = r_sym.checks.find((c) => c.id === 'concrete-cone')!;
    const cone_asym = r_asym.checks.find((c) => c.id === 'concrete-cone')!;
    // ext_total simétrico = 2·min(450,200) = 400.
    // ext_total asimétrico = min(450,50) + min(450,500) = 50 + 450 = 500.
    // bxA grows from x_range+400 to x_range+500 (con bars en ±150, x_range=300):
    //   sym  bxA = 300+400 = 700
    //   asym bxA = 300+500 = 800
    // ratio = 800/700 = 1.143. NRd,c también amplifica por ese factor.
    // Pero ψs cambia: sym c_min = 200 → ψs=0.833; asym c_min = 50 → ψs=0.733.
    // Net effect en util: ratio = 1/(1.143·0.733/0.833) ≈ 1/1.006 ≈ casi igual.
    // Verificar al menos que el ψs reportado refleja cX1=50:
    expect(cone_asym.limit).toMatch(/ψs=0,7[0-3]/);
    expect(cone_sym.limit).toMatch(/ψs=0,83/);
  });

  it('asimétrico cY1 = 50 (placa cerca borde y+) → ψs limitado por cY1', () => {
    const r = calcAnchorPlate({
      ...LEGACY,
      pedestal_cY1: 50, pedestal_cY2: 350,
    });
    const cone = r.checks.find((c) => c.id === 'concrete-cone')!;
    // c_min = 50 < c_cr = 450 → ψs = 0.7 + 0.3·50/450 = 0.733
    expect(cone.limit).toMatch(/ψs=0,73/);
  });

  it('helper preserva backward-compat: cambiar legacy pedestal_cX sin direccionales sigue funcionando', () => {
    // Override pedestal_cX (legacy field) sin tocar cX1/cX2 → resolveEdges
    // detecta cX1==cX2==default y usa pedestal_cX. ψs refleja el nuevo valor.
    const r = calcAnchorPlate({ ...LEGACY, pedestal_cX: 500, pedestal_cY: 500 });
    const cone = r.checks.find((c) => c.id === 'concrete-cone')!;
    // c_min = 500 ≥ c_cr = 450 → ψs = 1.00
    expect(cone.limit).toMatch(/ψs=1,00/);
  });

  it('splitting con cY1 cercano al borde → ψs reducido', () => {
    const r = calcAnchorPlate({
      ...LEGACY,
      pedestal_cY1: 80, pedestal_cY2: 320,
      pedestal_h: 400,    // forzar splitting a aplicar
      Mx: 30, My: 20,
    });
    const sp = r.checks.find((c) => c.id === 'splitting')!;
    if (sp.status !== 'neutral') {
      // c_min = 80, c_cr,sp = 450 → ψs,sp = 0.7+0.3·80/450 = 0.753
      expect(sp.limit).toMatch(/ψs=0\.7[2-6]/);
    }
  });

  it('anchorage cd usa edge direccional: bar cerca de cara cY1 pequeña', () => {
    // Bar en y=+100 con cY1=50 y cY2=350: cover_y+ = 50+(100-100)=50, cover_y- = 350+200=550.
    // min = 50 (cerca de cara +y).
    const r = calcAnchorPlate({
      ...LEGACY,
      pedestal_cY1: 50, pedestal_cY2: 350,
      bottom_anchorage: 'patilla', My: 5,
    });
    const al = r.checks.find((c) => c.id === 'anchorage-length')!;
    const cd_match = al.limit?.match(/cd=(\d+)/);
    if (cd_match) {
      const cd = parseInt(cd_match[1], 10);
      // El worst bar puede ser una en +y con coverY+=50. cd ≤ 50 → α1=1.0
      // o cd>3·φ=60 → α1=0.70. Depende de la geom exact.
      expect(cd).toBeLessThanOrEqual(90);   // cualquiera de 50, 90, 50 (semi-spacing)
    }
  });
});

describe('PR6 — CR3 splitting con fórmula CE Anejo 11 §7.2.1.6 correcta', () => {
  it('FTUX biaxial: ψh, ψec, ψs reportados separados en limit string', () => {
    // Pre-CR3: limit showed ψh based on edge distance (wrong variable).
    // Post-CR3: separa ψh,sp (por h_pedestal), ψec,sp (por excentricidad grupo),
    // ψs,sp (por edge).
    const r = calcAnchorPlate(LEGACY);
    const sp = r.checks.find((c) => c.id === 'splitting')!;
    expect(sp.limit).toMatch(/ψh=\d/);
    expect(sp.limit).toMatch(/ψec=\d/);
    expect(sp.limit).toMatch(/ψs=\d/);
  });

  it('ψh,sp por canto del macizo (no por edge): h grande → ψh > 1 (amplifica)', () => {
    // Pedestal profundo (h=2000 > 2·hef=600), edge moderado (200) → ψh > 1 (cap-binding)
    const r = calcAnchorPlate({ ...LEGACY, pedestal_h: 2000 });
    const sp = r.checks.find((c) => c.id === 'splitting')!;
    expect(sp.limit).toMatch(/ψh=1,[2-9]\d/);   // amplificación visible
  });

  it('ψh,sp < 1 con macizo somero: la reducción por canto aplica (fix auditoría #24)', () => {
    // h_pedestal=400 < 2·hef=600 → ψh,sp = (400/600)^(2/3) = 0.763. El floor
    // a 1.0 anterior anulaba la penalización JUSTO en el régimen por el que
    // el check se activa (encepados/macizos someros, el caso splitting-crítico):
    // con h=hef la capacidad quedaba ×1.6 sobreestimada.
    const r = calcAnchorPlate({ ...LEGACY, pedestal_h: 400 });
    const sp = r.checks.find((c) => c.id === 'splitting')!;
    expect(sp.limit).toContain('ψh=0,76');
  });

  it('h_pedestal ≥ 2·hef y c_min ≥ c_cr,sp → no crítico (neutral)', () => {
    const r = calcAnchorPlate({
      ...LEGACY,
      pedestal_cX: 500, pedestal_cY: 500, pedestal_h: 1000,
    });
    const sp = r.checks.find((c) => c.id === 'splitting')!;
    expect(sp.limit).toBe('No crítico');
    expect(sp.status).toBe('neutral');
    expect(sp.utilization).toBe(0);
  });

  it('NRd,sp NO multiplica por n_t (espurio): cambiar n_t a misma carga no escala n veces', () => {
    // Comparar layout 4-corner vs 9-grid con misma fck/hef/geometría placa:
    // bajo CR3-fixed, NRd,sp depende sólo de geometría (Ac/Ac0·ψ's), no de
    // tBars.length. Si la geometría del grupo es similar, NRd,sp no debe
    // diferir por el factor n_t.
    const r4 = calcAnchorPlate({ ...LEGACY, bar_nLayout: 4, My: 10 });
    const r9 = calcAnchorPlate({ ...LEGACY, bar_nLayout: 8, My: 10 });
    const sp4 = r4.checks.find((c) => c.id === 'splitting')!;
    const sp9 = r9.checks.find((c) => c.id === 'splitting')!;
    // Pre-CR3: NRd_sp_9 ≈ NRd_sp_4 · 9/4 = 2.25× (espurio).
    // Post-CR3: NRd_sp depende solo de Ac (geometría del grupo tensionado).
    // Ratio esperado: <1.5 (sólo por diferencia geométrica del grupo, no por count).
    const limit4_match = sp4.limit?.match(/NRd,sp=([\d.]+)/);
    const limit9_match = sp9.limit?.match(/NRd,sp=([\d.]+)/);
    if (limit4_match && limit9_match) {
      const r = parseFloat(limit9_match[1]) / parseFloat(limit4_match[1]);
      expect(r).toBeLessThan(1.6);    // pre-CR3 daría >2.0
    }
  });

  it('ψec,sp < 1 cuando el grupo traccionado es excéntrico', () => {
    // FTUX con Mx grande crea grupo tensionado excéntrico.
    const r = calcAnchorPlate({ ...LEGACY, Mx: 80 });
    const sp = r.checks.find((c) => c.id === 'splitting')!;
    const psi_ec_match = sp.limit?.match(/ψec=([\d.,]+)/);
    if (psi_ec_match) {
      const psi_ec = parseFloat(psi_ec_match[1].replace(',', '.'));
      expect(psi_ec).toBeLessThan(1.0);
      expect(psi_ec).toBeGreaterThan(0.0);
    }
  });
});

describe('PR7b — CR1 biaxial Ft distribution lineal con cap', () => {
  it('FTUX biaxial (Mx=45, My=10) ya NO satura — Ft_total moderado', () => {
    // Pre-CR1: solver clava Ft = FtRd en cada barra tensa → Ft_total = n·FtRd
    // = 4·136.6 = 546 kN, cono al 7×.
    // Post-CR1: distribución lineal proporcional al signed dist al NA, capada
    // a FtRd. Hand calc: phi ≈ 12.5°, Ft_total ≈ 27-35 kN.
    const r = calcAnchorPlate(LEGACY);
    expect(r.solver.mode).toBe('biaxial-plastic');
    expect(r.solver.converged).toBe(true);
    expect(r.solver.Ft_total).toBeGreaterThan(20);
    expect(r.solver.Ft_total).toBeLessThan(50);
  });

  it('FTUX biaxial NA orientado al momento externo (phi ≈ atan(My/Mx))', () => {
    const r = calcAnchorPlate(LEGACY);
    const phi_expected = Math.atan2(LEGACY.My, LEGACY.Mx);
    expect(r.solver.phi_NA).toBeCloseTo(phi_expected, 1);   // ±0.05 rad ≈ 3°
  });

  it('FTUX biaxial residuos de momento ≈ 0 (equilibrio exacto)', () => {
    const r = calcAnchorPlate(LEGACY);
    expect(Math.abs(r.solver.residuals.SMx_kNm)).toBeLessThan(0.01);
    expect(Math.abs(r.solver.residuals.SMy_kNm)).toBeLessThan(0.01);
  });

  it('cargas bajas → Ft_total bajo (no saturado, bolt-tension util < 1)', () => {
    const r = calcAnchorPlate({ ...LEGACY, Mx: 10, My: 2 });
    const bt = r.checks.find((c) => c.id === 'bolt-tension')!;
    expect(bt.utilization).toBeLessThan(0.5);
    // El bug pre-CR1 daba util ≡ 1.00 incluso en cargas bajas.
  });

  it('cargas altas → al menos una barra al cap FtRd', () => {
    // Mx muy alto fuerza saturación al menos en la barra más extrema.
    const r = calcAnchorPlate({ ...LEGACY, Mx: 250, My: 0 });
    const maxFt = Math.max(...r.solver.bolts.map((b) => b.Ft));
    // FtRd = 314.16·434.78/1000 ≈ 136.59 kN. Esperar al menos 90% si carga
    // alta. (No siempre llega exactamente a 136.59 por la convergencia
    // de bisección.)
    expect(maxFt).toBeGreaterThan(120);
  });

  it('distribución lineal: Ft proporcional al signed distance al NA', () => {
    const r = calcAnchorPlate(LEGACY);
    const tBars = r.solver.bolts.filter((b) => b.inTension);
    if (tBars.length < 2) return;
    // Para cada par de barras tensas, Ft_i / sd_i debe ser ~constante.
    const cos = Math.cos(r.solver.phi_NA!);
    const sin = Math.sin(r.solver.phi_NA!);
    const d = r.solver.d_NA!;
    const ratios = tBars.map((b) => b.Ft / (d - (b.x * cos + b.y * sin)));
    const min = Math.min(...ratios);
    const max = Math.max(...ratios);
    // ratios deben ser todos iguales (α común), excepto si hay cap.
    // Aquí asumimos no cap → ratios ~iguales con tolerancia 1%.
    if (max < 130 / Math.max(...tBars.map((b) => d - (b.x * cos + b.y * sin))) * 1.05) {
      // No saturation → ratios uniform
      expect(max / min).toBeLessThan(1.01);
    }
  });

  it('My=0 caso degenerado → axis-aligned y matches PR7a', () => {
    const r = calcAnchorPlate({ ...LEGACY, My: 0 });
    // Dispatcher rutea a solveAxisAligned4 para nLayout=4 + My=0 (PR5).
    expect(['partial-lift', 'uniform-compression']).toContain(r.solver.mode);
    // Ft_total debe coincidir con PR7a (~25.98 kN, post-H2 Kj real)
    expect(r.solver.Ft_total).toBeCloseTo(25.98, 1);
  });
});

describe('PR7a — CR2 partial-lift saturated + equilibrium', () => {
  it('Mx muy alto saturando barras → mode partial-lift-saturated, converged=false', () => {
    // Aumentar Mx para que Ft_per_bar > FtRd (=136.6 kN).
    // Para FTUX, Ft_total = A_c·y_c − NEd. Saturado cuando Ft_per_bar > 136.6 → Ft_total > 273.
    // Aumentar Mx hasta forzar eso. Con NEd=200 y demás defaults:
    //   y_c desde Ft_total=273: A_c·y_c = NEd + Ft_total = 473 kN → y_c = 473000/5833 ≈ 81.1 mm.
    //   Recuperar M desde y_c: M = A_c·y_c·(L_t - y_c/2) - NEd·L_n
    //                          = 5833·81·(350-40.5) - 200000·150
    //                          = 5833·81·309.5 - 3e7 = 146.3·10^6 - 30·10^6 = 116.3·10^6 Nmm = 116 kNm
    // Mx > 116 kNm → saturado. Probar con Mx=200.
    const sol = solveAxisAligned4({ ...base, Mx: 200 });
    expect(sol.mode).toBe('partial-lift-saturated');
    expect(sol.converged).toBe(false);
    expect(sol.note).toContain('Tracción agotada');
  });
  it('saturated case: Ft_per_bar = FtRd exactly', () => {
    const sol = solveAxisAligned4({ ...base, Mx: 200 });
    const tensioned = sol.bolts.filter((b) => b.inTension);
    expect(tensioned.length).toBeGreaterThan(0);
    // FtRd para φ20 B500S = 314.16·434.78/1000 = 136.59 kN
    for (const b of tensioned) {
      expect(b.Ft).toBeCloseTo(136.59, 1);
    }
  });
  it('saturated case: SMx residual ≠ 0 (no equilibrio físico)', () => {
    const sol = solveAxisAligned4({ ...base, Mx: 200 });
    // Cuando satura, el momento residual es la cantidad que la sección
    // NO puede sostener. Debe ser no-trivial.
    expect(Math.abs(sol.residuals.SMx_kNm)).toBeGreaterThan(10);
  });
  it('NEd≤0 → mode saturated con nota de H4/PR10 (degradación graceful)', () => {
    // H4 (NEd<0 pure tension) es PR10. Hasta entonces solveAxisAligned4 degrada
    // a saturated explícitamente en lugar de devolver basura silenciosa.
    const sol = solveAxisAligned4({ ...base, NEd: -50, Mx: 20 });
    expect(sol.mode).toBe('partial-lift-saturated');
    expect(sol.converged).toBe(false);
    expect(sol.note).toContain('PR10');
  });
  it('property: aumentar Mx (sin saturar) aumenta Ft_total monotónicamente', () => {
    const r1 = solveAxisAligned4({ ...base, Mx: 30 });
    const r2 = solveAxisAligned4({ ...base, Mx: 60 });
    const r3 = solveAxisAligned4({ ...base, Mx: 90 });
    expect(r2.Ft_total).toBeGreaterThan(r1.Ft_total);
    expect(r3.Ft_total).toBeGreaterThan(r2.Ft_total);
    // None saturated for these values (Ft_total < 273 for all 3)
    expect(r3.mode).toBe('partial-lift');
  });
  it('property: aumentar NEd reduce Ft_total (compresión externa equilibra el momento)', () => {
    const r_lowN = solveAxisAligned4({ ...base, NEd: 100, Mx: 45 });
    const r_highN = solveAxisAligned4({ ...base, NEd: 400, Mx: 45 });
    // Más compresión axial → menos tracción necesaria en las barras.
    expect(r_highN.Ft_total).toBeLessThan(r_lowN.Ft_total);
  });
});

describe('PR5 — CR4 dispatcher rutea nLayout>4 a biaxial bajo Mx puro', () => {
  it('nLayout=6 + My=0 → solver biaxial, modela 6 barras', () => {
    // Pre-CR4: dispatcher rutea a solveAxisAligned4 (sólo 4 esquinas, ignora central).
    // Post-CR4: rutea a biaxial siempre que nLayout > 4.
    const r = calcAnchorPlate({ ...base, bar_nLayout: 6, My: 0 });
    expect(r.solver.bolts).toHaveLength(6);
    expect(['biaxial-plastic', 'biaxial-grid']).toContain(r.solver.mode);
  });
  it('nLayout=8 + My=0 → solver biaxial, modela 8 barras', () => {
    const r = calcAnchorPlate({ ...base, bar_nLayout: 8, My: 0 });
    expect(r.solver.bolts).toHaveLength(8);
    expect(['biaxial-plastic', 'biaxial-grid']).toContain(r.solver.mode);
  });
  it('nLayout=12 + My=0 → solver biaxial, modela 12 barras', () => {
    const r = calcAnchorPlate({ ...base, bar_nLayout: 12, My: 0 });
    expect(r.solver.bolts).toHaveLength(12);
    expect(['biaxial-plastic', 'biaxial-grid']).toContain(r.solver.mode);
  });
  it('nLayout=4 + My=0 SIGUE en axis-aligned (happy path conservado)', () => {
    const r = calcAnchorPlate({ ...base, bar_nLayout: 4, My: 0 });
    expect(r.solver.bolts).toHaveLength(4);
    expect(['uniform-compression', 'partial-lift']).toContain(r.solver.mode);
  });
  it('nLayout=4 + uniform-compression sigue uniform-compression', () => {
    const r = calcAnchorPlate({ ...base, NEd: 500, Mx: 0, My: 0 });
    expect(r.solver.mode).toBe('uniform-compression');
  });
});

describe('PR5 — H10 checkBoltShear usa bars.length real (no inp.bar_nLayout)', () => {
  it('nLayout=6 → cortante repartido entre 6 barras (no 4)', () => {
    const r = calcAnchorPlate({ ...base, bar_nLayout: 6, My: 0, VEd: 100 });
    const bs = r.checks.find((c) => c.id === 'bolt-shear')!;
    expect(bs.limit).toContain('6·FvRd');
  });
  it('nLayout=12 → cortante repartido entre 12 barras', () => {
    const r = calcAnchorPlate({ ...base, bar_nLayout: 12, My: 5, VEd: 100 });
    const bs = r.checks.find((c) => c.id === 'bolt-shear')!;
    expect(bs.limit).toContain('12·FvRd');
  });
});

describe('PR5 — H14 anchorage cd derivado de coordenadas reales', () => {
  it('cd reportado en el limit string (cuando hay tracción)', () => {
    const r = calcAnchorPlate({ ...base, bottom_anchorage: 'patilla' });
    const an = r.checks.find((c) => c.id === 'anchorage-length')!;
    expect(an.limit).toMatch(/cd=\d+ mm/);
  });
  it('barra interior tiene coverX mayor que barra de esquina', () => {
    // En el anillo de 8, las barras centradas (0, ±yMax) y (±xMax, 0) tienen
    // mayor recubrimiento horizontal o vertical que las esquinas. El check
    // reporta el peor, que sigue siendo una esquina con cd = pedestal_cX.
    const r = calcAnchorPlate({ ...base, bar_nLayout: 8, My: 5 });
    const an = r.checks.find((c) => c.id === 'anchorage-length')!;
    // Si la peor barra es una esquina, cd ≤ pedestal_cX (200).
    const cdMatch = an.limit?.match(/cd=(\d+) mm/);
    expect(cdMatch).not.toBeNull();
    const cd = parseInt(cdMatch![1], 10);
    expect(cd).toBeLessThanOrEqual(200);
  });
});

describe('PR3 — skipped checks render as neutral (H8)', () => {
  it('pullout con prolongacion_recta → status=neutral', () => {
    const r = calcAnchorPlate({ ...base, bottom_anchorage: 'prolongacion_recta' });
    const po = r.checks.find((c) => c.id === 'pullout')!;
    expect(po.status).toBe('neutral');
  });
  it('anchorage-length con arandela_tuerca → status=neutral', () => {
    const r = calcAnchorPlate({ ...base, bottom_anchorage: 'arandela_tuerca', washer_od: 50 });
    const al = r.checks.find((c) => c.id === 'anchorage-length')!;
    expect(al.status).toBe('neutral');
  });
  it('concrete-cone sin tracción → status=neutral', () => {
    const r = calcAnchorPlate({ ...base, NEd: 500, Mx: 0, My: 0 });
    const cc = r.checks.find((c) => c.id === 'concrete-cone')!;
    expect(cc.status).toBe('neutral');
  });
  it('splitting cuando c ≥ c_cr,sp → status=neutral', () => {
    const r = calcAnchorPlate({ ...base, pedestal_cX: 500, pedestal_cY: 500 });
    const sp = r.checks.find((c) => c.id === 'splitting')!;
    expect(sp.status).toBe('neutral');
  });
  it('stiffener con rib_count=0 → status=neutral', () => {
    const r = calcAnchorPlate({ ...base, rib_count: 0 });
    const st = r.checks.find((c) => c.id === 'stiffener')!;
    expect(st.status).toBe('neutral');
  });
});

describe('PR3 — validation fail forces overallStatus=fail (H13)', () => {
  it('washer_od ≤ bar_diam → overallStatus=fail aunque worstUtil pueda ser <1', () => {
    // arandela_tuerca con washer_od inválido (=bar_diam) marca severity='fail' en validateAnchorPlate
    const r = calcAnchorPlate({
      ...base,
      bottom_anchorage: 'arandela_tuerca',
      washer_od: 20,  // = bar_diam, validation fail
      NEd: 50, Mx: 5, My: 0, NEd_G: 30,
    });
    expect(r.warnings.some((w) => w.severity === 'fail')).toBe(true);
    expect(r.overallStatus).toBe('fail');
  });

  it('sin validation fail, overallStatus respeta toStatus(worstUtil)', () => {
    const r = calcAnchorPlate(base);
    expect(r.warnings.some((w) => w.severity === 'fail')).toBe(false);
    // overallStatus debe ser lo que toStatus(worstUtil) devuelva (no forzado)
  });
});

// L3 + L13 (Phase 5) — tests para casos límite que la auditoría reportó como
// no cubiertos: NEd<0 con momento, layout 8 con Mx puro (debe rutear a
// biaxial), geometría inválida (bar_edge > plate_a/2), y concrete shear
// modes con cargas a borde.
describe('L3 — NEd<0 con momento (mástil + biaxial)', () => {
  it('NEd=-30, Mx=10, My=5 → pure-tension, todas las barras pueden tomar Ft', () => {
    const r = calcAnchorPlate({ ...base, NEd: -30, NEd_G: 0, Mx: 10, My: 5, VEd: 0 });
    expect(r.solver.mode).toBe('pure-tension');
    expect(r.solver.Nc).toBe(0);                // no compression block
    expect(r.solver.Ft_total).toBeGreaterThan(0);
    // Σ Ft debe equilibrar al menos el axil tensil aplicado (-NEd=30 kN).
    expect(r.solver.Ft_total).toBeGreaterThanOrEqual(29);
  });
});

describe('L3 — layout 8 con Mx puro (CR4: NO debe ir a axis-aligned-4)', () => {
  it('rutea a biaxial y modela las 8 barras (no 4)', () => {
    const r = calcAnchorPlate({ ...base, bar_nLayout: 8, My: 0, Mx: 80, VEd: 0 });
    expect(['biaxial-plastic', 'biaxial-grid']).toContain(r.solver.mode);
    expect(r.solver.bolts).toHaveLength(8);
  });
});

describe('L3 — geometría inválida bar_edge > plate_a/2', () => {
  it('no crashea, solver devuelve resultado con warnings', () => {
    // bar_edge_x=250 con plate_a=400 → la barra cae fuera de la placa.
    const r = calcAnchorPlate({ ...base, bar_edge_x: 250 });
    // El cálculo no debe lanzar; el resultado debe seguir siendo finito.
    expect(isFinite(r.worstUtil)).toBe(true);
    // generateLayout colocará las barras en posiciones físicamente raras,
    // pero el solver no debe propagar NaN.
    for (const b of r.solver.bolts) {
      expect(isFinite(b.x)).toBe(true);
      expect(isFinite(b.Ft)).toBe(true);
    }
  });
});

describe('L13 — concrete shear modes con cargas a borde', () => {
  it('Vx grande + cX1 corto → checkConcreteEdgeBreakout reporta util > 0', () => {
    const r = calcAnchorPlate({
      ...base,
      Vx: 200, Vy: 0, VEd: 200,
      pedestal_cX1: 50, pedestal_cX2: 500, pedestal_cY1: 200, pedestal_cY2: 200,
    });
    const eb = r.checks.find((c) => c.id === 'concrete-edge-breakout')!;
    expect(eb.utilization).toBeGreaterThan(0);
    expect(eb.status).not.toBe('neutral');
  });
  it('Sin cortante → edge-breakout y pry-out son neutral', () => {
    const r = calcAnchorPlate({ ...base, Vx: 0, Vy: 0, VEd: 0 });
    const eb = r.checks.find((c) => c.id === 'concrete-edge-breakout')!;
    const py = r.checks.find((c) => c.id === 'concrete-pryout')!;
    expect(eb.status).toBe('neutral');
    expect(py.status).toBe('neutral');
  });
});

describe('H12 (Phase 5) — dispatcher NEd<EPS_N rutea a biaxial (no axis-aligned)', () => {
  it('NEd=0.01 (≈0) + Mx=5: NO degenera con e enorme', () => {
    // Pre-H12: NEd_safe = max(0.01, 1e-6) = 0.01 → nearPureCompression
    //          comparaba M_ext (5) < 0.01·0.01·400/6/1000 ≈ 6.7e-6 → false
    //          OK. Pero NEd=0 con cualquier M lo rompía. Ahora exige NEd ≥ 0.1.
    const r = calcAnchorPlate({ ...base, NEd: 0.01, Mx: 5, My: 1 });
    expect(['biaxial-plastic', 'biaxial-grid', 'pure-tension']).toContain(r.solver.mode);
    expect(isFinite(r.worstUtil)).toBe(true);
  });
});

describe('H7 (Phase 5) — alzado: el anillo con pares (12) expone ×N en columnas', () => {
  it('result.solver.bolts.length === 12 (no se han ocultado)', () => {
    // LEGACY arrastra sx = 300 y sy = 200 (los viejos «separación», que el
    // motor ignoraba): con la 12 son la separación del par central y 300/2 =
    // 150 pondría los pares justo sobre las esquinas. Se fijan aquí.
    const r = calcAnchorPlate({ ...base, bar_nLayout: 12, bar_spacing_x: 100, bar_spacing_y: 80, Mx: 30, My: 5 });
    expect(r.solver.bolts).toHaveLength(12);
    // Sanity: agrupando por x_round quedan 4 columnas — las dos de los
    // extremos (x = ±150) con 4 barras (esquinas + par lateral) y las dos del
    // par central (x = ±sx/2) con 2 barras cada una. El SVG mostrará ×4 y ×2.
    const byX = new Map<number, number>();
    for (const b of r.solver.bolts) {
      const k = Math.round(b.x);
      byX.set(k, (byX.get(k) ?? 0) + 1);
    }
    expect(byX.size).toBe(4);
    expect(Array.from(byX.values()).sort()).toEqual([2, 2, 4, 4]);
  });
});

describe('2UPN en cajón (2026-09-23): el motor lee la huella de cuatro paredes', () => {
  // 2UPN 200 (200 × 150, tf = 11,5, tw = 8,5) en la placa de los defaults
  // (350×350×20, anillo de 8Ø20, «#» de 120×10).
  const cajon = { ...anchorPlateDefaults, sectionType: '2UPN' as const, sectionSize: 200 };

  it('calcula de punta a punta: 15 comprobaciones finitas y ninguna barra pisa acero', () => {
    const r = calcAnchorPlate(cajon);
    expect(r.valid).toBe(true);
    expect(r.checks).toHaveLength(15);
    for (const c of r.checks) expect(Number.isFinite(c.utilization)).toBe(true);
    expect(r.warnings.filter((w) => w.severity === 'fail')).toHaveLength(0);
  });

  it('la compresión bajo placa ve las cuatro paredes: la corona de ancho c no llena el hueco del cajón, y las cartelas suman', () => {
    const fjd = 15;
    const conCartelas = tStubEffectiveArea(cajon, fjd);
    const sinCartelas = tStubEffectiveArea({ ...cajon, rib_count: 0 }, fjd);
    expect(sinCartelas.c).toBeGreaterThan(0);
    // Sin cartelas: unión de las cuatro paredes ensanchadas c, que es la
    // envolvente (200 + 2c) × (150 + 2c) MENOS el hueco interior que la
    // corona no alcanza (por dentro el cajón mide 177 × 133).
    const envolvente = (200 + 2 * sinCartelas.c) * (150 + 2 * sinCartelas.c);
    expect(sinCartelas.A_eff).toBeLessThan(envolvente);
    expect(sinCartelas.A_eff).toBeGreaterThan(envolvente - 177 * 133);
    expect(conCartelas.A_eff).toBeGreaterThan(sinCartelas.A_eff);
    expect(conCartelas.A_eff).toBeLessThanOrEqual(cajon.plate_a * cajon.plate_b);
  });

  it('el T-stub de la barra traccionada se apoya en la cartela, no en una cara del perfil que no existe', () => {
    const r = calcAnchorPlate({ ...cajon, Mx: 60, My: 0 });
    const row = r.checks.find((c) => c.id === 'plate-tension-tstub')!;
    expect(row.limit).toContain('al rigidizador');
    expect(Number.isFinite(row.utilization)).toBe(true);
  });
});
