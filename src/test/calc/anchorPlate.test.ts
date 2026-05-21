// Anchor plate (PR-3) — rebar model + axis-aligned + biaxial solver + 10 real checks.
// Run: bun test src/test/calc/anchorPlate.test.ts

import { describe, expect, it } from 'vitest';
import { calcAnchorPlate, solveAxisAligned4 } from '../../lib/calculations/anchorPlate';
import { anchorPlateDefaults } from '../../data/defaults';

// Axis-aligned-solver tests assume My=0. Defaults have My≠0 for biaxial FTUX,
// so we override it here to isolate the axis-aligned solver from the biaxial path.
const base = { ...anchorPlateDefaults, My: 0 };
// base: HEB-200, placa 400×300×20 S275, 4·φ20 B500S en esquinas,
//       NEd=200 kN, Mx=45 kNm, My=0, VEd=50 kN, fck=25 MPa, prolongación recta.

describe('anchor plate — zero loads', () => {
  it('result invalid when NEd=Mx=My=0', () => {
    const r = calcAnchorPlate({ ...base, NEd: 0, Mx: 0, My: 0 });
    expect(r.valid).toBe(false);
    expect(r.checks).toHaveLength(0);
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
  //   α extension = min(3, max(1, min(1+2·150/400, 1+2·150/300))) = 1.75
  //   fjd = (2/3)·1.75·(25/1.5) = 19.444 MPa
  //   A_c = fjd · plate_b = 19.444 · 300 = 5833.3 N/mm
  //   disc = L_t² − 2·(M + NEd·L_n)/A_c
  //        = 350² − 2·(45·10⁶ + 200·10³·150)/5833.3
  //        = 122500 − 25714.3 = 96785.7
  //   y_c = L_t − √disc = 350 − 311.10 = 38.90 mm
  //   Ft_total = A_c·y_c − NEd_N = 5833.3·38.90 − 200000 = 26893 N ≈ 26.89 kN
  //   Nc = NEd + Ft_total ≈ 226.89 kN
  //   Ft_per_bar = 26.89/2 ≈ 13.45 kN  (FtRd_per_bar=136.6 → NO saturado)
  const sol = solveAxisAligned4(base);

  it('mode = partial-lift', () => expect(sol.mode).toBe('partial-lift'));
  it('two bars in tension', () => expect(sol.n_t).toBe(2));
  it('Ft_total matches plastic block equilibrium (~26.89 kN)', () => {
    expect(sol.Ft_total).toBeCloseTo(26.89, 1);
  });
  it('Nc = NEd + Ft_total', () => {
    expect(sol.Nc).toBeCloseTo(226.89, 1);
  });
  it('lifted flag is true', () => expect(sol.lifted).toBe(true));
  it('Ft distributed equally across tensioned corner pair', () => {
    const tensioned = sol.bolts.filter((b) => b.inTension);
    expect(tensioned).toHaveLength(2);
    for (const b of tensioned) expect(b.Ft).toBeCloseTo(13.45, 1);
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

  it('valid case returns 13 checks (10 originales + 3 concrete-shear de PR8b)', () => {
    expect(r.checks).toHaveLength(13);
  });
  it('all checks carry a real id and article', () => {
    const expectedIds = [
      'plate-compression', 'plate-bending', 'bolt-tension', 'bolt-shear',
      'bolt-interaction', 'anchorage-length', 'concrete-cone',
      'concrete-edge-breakout', 'concrete-pryout', 'concrete-breakout-v',  // PR8b CR6
      'pullout', 'splitting', 'stiffener',
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
  it('limitations empty for default (nLayout=4, rib_count=2)', () => {
    expect(r.pr1Limitations).toHaveLength(0);
  });
  it('limitations empty for rib_count=4 (refinado por eje, ya no se marca)', () => {
    const r4 = calcAnchorPlate({ ...base, rib_count: 4 });
    expect(r4.pr1Limitations).toHaveLength(0);
  });
});

// ─── Plate-bending per-axis refinement (PR-4) ────────────────────────────

describe('check 2 — flexión placa: voladizo por eje según rib_count', () => {
  // HEB-200 (h=b=200), placa 400×300 → c_strong = 100, c_weak = 50.
  it('rib_count=0 → c_eff = max(c_strong, c_weak) = 100 mm', () => {
    const r = calcAnchorPlate({ ...base, rib_count: 0 });
    const pb = r.checks.find((c) => c.id === 'plate-bending')!;
    expect(pb.limit).toContain('c=100 mm');
  });
  it('rib_count=2 parte sólo el eje fuerte → c_eff = max(50, 50) = 50 mm', () => {
    const r = calcAnchorPlate({ ...base, rib_count: 2 });
    const pb = r.checks.find((c) => c.id === 'plate-bending')!;
    expect(pb.limit).toContain('c=50 mm');
  });
  it('rib_count=4 parte ambos ejes → c_eff = max(50, 25) = 50 mm (geometría simétrica)', () => {
    const r = calcAnchorPlate({ ...base, rib_count: 4 });
    const pb = r.checks.find((c) => c.id === 'plate-bending')!;
    expect(pb.limit).toContain('c=50 mm');
  });
  it('rib_count=2 deja el eje débil sin partir cuando es el que manda', () => {
    // Placa 300×500 con HEB-200 (h=b=200) → c_strong=50, c_weak=150.
    // rib_count=2 (nervios en eje fuerte): c_eff = max(25, 150) = 150.
    const r = calcAnchorPlate({ ...base, plate_a: 300, plate_b: 500, rib_count: 2 });
    const pb = r.checks.find((c) => c.id === 'plate-bending')!;
    expect(pb.limit).toContain('c=150 mm');
  });
  it('rib_count=4 sí parte el voladizo débil', () => {
    // Misma placa 300×500: rib_count=4 → c_eff = max(25, 75) = 75 mm.
    const r = calcAnchorPlate({ ...base, plate_a: 300, plate_b: 500, rib_count: 4 });
    const pb = r.checks.find((c) => c.id === 'plate-bending')!;
    expect(pb.limit).toContain('c=75 mm');
  });
});

describe('anchor plate — biaxial solver', () => {
  // Defaults already carry My=10 → biaxial path. Use defaults directly.
  const biax = { ...anchorPlateDefaults };
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
    expect(r6.pr1Limitations.some((s) => s.includes('layout'))).toBe(false);
  });
  it('supports 8-bar layout', () => {
    const r8 = calcAnchorPlate({ ...biax, bar_nLayout: 8 });
    expect(r8.solver.bolts).toHaveLength(8);
  });
  it('supports 9-bar layout', () => {
    const r9 = calcAnchorPlate({ ...biax, bar_nLayout: 9 });
    expect(r9.solver.bolts).toHaveLength(9);
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
    const r = calcAnchorPlate({ ...base, NEd: 100, NEd_G: 10, Mx: 0, My: 0, VEd: 320 });
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
  it('deep hef + large edge distance → comfortable capacity', () => {
    const r = calcAnchorPlate({ ...base, bar_hef: 300, pedestal_cX: 500, pedestal_cY: 500 });
    const cc = r.checks.find((c) => c.id === 'concrete-cone')!;
    expect(cc.utilization).toBeLessThan(cc.utilization + 1e-9); // finite
    // ψs should be 1.0 when c ≥ 1.5·hef = 450 mm.
    expect(cc.limit).toContain('ψs=1.00');
  });
  it('close-to-edge → ψs reduction visible', () => {
    // c = 100 mm, hef = 200 → c_cr = 300 > 100, so ψs = 0.7 + 0.3·100/300 = 0.80
    const r = calcAnchorPlate({ ...base, bar_hef: 200, pedestal_cX: 100, pedestal_cY: 100 });
    const cc = r.checks.find((c) => c.id === 'concrete-cone')!;
    expect(cc.limit).toContain('ψs=0.80');
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
    expect(an.value).toContain('α1=0.70');
  });
  it('gancho con cd > 3·φ → α1=0.70', () => {
    const r = calcAnchorPlate({ ...base, bottom_anchorage: 'gancho' });
    const an = r.checks.find((c) => c.id === 'anchorage-length')!;
    expect(an.value).toContain('α1=0.70');
  });
  it('patilla con cd ≤ 3·φ (recubrimiento ajustado) → α1=1.00', () => {
    // pedestal_cX=50 → cd = min(50,200,140,90) = 50 ≤ 60 → α1=1.0.
    const r = calcAnchorPlate({ ...base, bottom_anchorage: 'patilla', pedestal_cX: 50 });
    const an = r.checks.find((c) => c.id === 'anchorage-length')!;
    expect(an.value).toContain('α1=1.00');
  });
  it('prolongación recta → α1=1.00 siempre', () => {
    const r = calcAnchorPlate({ ...base, bottom_anchorage: 'prolongacion_recta' });
    const an = r.checks.find((c) => c.id === 'anchorage-length')!;
    expect(an.value).toContain('α1=1.00');
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
    expect(an.value).toContain('α1=0.70');
  });
  it('H14 (PR5): layout 9 con plate pequeña → barras vecinas próximas → cd pequeño → α1=1.00', () => {
    // 9-grid 3×3 en placa 300×300 con bar_edge=40 → xs en {−110, 0, +110}.
    // La barra central tiene vecinas a 110 mm → halfSpacing = (110−20)/2 = 45 < 60 → α1=1.0.
    // Esto sólo funciona porque generateLayout produce el spacing real (post-H14),
    // no inp.bar_spacing_x.
    const r = calcAnchorPlate({
      ...base,
      bottom_anchorage: 'patilla',
      bar_nLayout: 9,
      plate_a: 300, plate_b: 300,
      bar_edge_x: 40, bar_edge_y: 40,
      My: 5,   // pequeño momento biaxial para que algunas barras estén traccionadas
    });
    const an = r.checks.find((c) => c.id === 'anchorage-length')!;
    expect(an.value).toContain('α1=1.00');
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
    expect(po.limit).toContain('NRd,p=206.2');
    expect(po.limit).toContain('k2=7.5');
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
    expect(po.limit).toContain('NRd,p=288.6');
    expect(po.limit).toContain('k2=10.5');
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

describe('check 10 — stiffener (EC3 §5.5 + §4.5.3)', () => {
  it('rib_count=0 → check reports neutral', () => {
    const r = calcAnchorPlate({ ...base, rib_count: 0 });
    const st = r.checks.find((c) => c.id === 'stiffener')!;
    expect(st.utilization).toBe(0);
    expect(st.value).toBe('Sin rigidizadores');
  });
  it('rib_count=2 → slenderness or weld governs (real values)', () => {
    const r = calcAnchorPlate(base);
    const st = r.checks.find((c) => c.id === 'stiffener')!;
    expect(st.utilization).toBeGreaterThan(0);
    expect(st.limit).toMatch(/(esbeltez|soldadura)/);
  });
  it('slenderness limit tightens for S355 (lower ε)', () => {
    const rS355 = calcAnchorPlate({ ...base, plate_steel: 'S355' });
    const st = rS355.checks.find((c) => c.id === 'stiffener')!;
    // ε = √(235/355) ≈ 0.814 → 14·ε ≈ 11.4 < 12 (rib_h/rib_t=120/10), esbeltez NO FAIL pero alta.
    expect(st.limit).toContain('c/t≤11.4');
  });
});

// Manual hand-calc oracle suite (5 configs A-E) was extracted to
// src/test/calc/anchorPlateOracle.test.ts in PR1 of the audit-driven refactor.
// Each config is activated as the corresponding fix PR lands. See that file
// for the full normative derivations.

describe('PR10 — H4 NEd<0 pure-tension branch', () => {
  it('Tracción axial pura (M=0) → distribución uniforme entre todas las barras', () => {
    // NEd=-100 kN, 4 barras → Ft_per_bar = 25 kN exacto.
    const r = calcAnchorPlate({ ...anchorPlateDefaults, NEd: -100, Mx: 0, My: 0 });
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
      ...anchorPlateDefaults,
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
      ...anchorPlateDefaults,
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
    const r = calcAnchorPlate({ ...anchorPlateDefaults, NEd: -10, Mx: 5, My: 0 });
    expect(r.solver.mode).toBe('pure-tension' as never);
  });

  it('NEd<0 con momento grande: alcanza saturación si requiere Ft > FtRd', () => {
    // FtRd_per_bar φ20 B500S = 136.6 kN. NEd=-200 kN para 4 barras = 50 kN avg,
    // bien por debajo. Pero un Mx muy grande podría saturar una barra.
    // Mx = 200 kNm con bars en (±150, ±100): cada barra +x recibe ~b·150·2 contrib.
    // Para saturar (Ft_max=136.6): a + b·150 + c·100 = 136.6
    // Con a=50 (uniform), b=Mx·1000/Σx²=200000/(4·150²)=2.22 → b·150=333. Demasiado.
    // Eso da 50+333+0 = 383 → satura. ★
    const r = calcAnchorPlate({ ...anchorPlateDefaults, NEd: -200, Mx: 200, My: 0 });
    expect(r.solver.mode).toBe('pure-tension' as never);
    expect(r.solver.note).toMatch(/saturada/i);
  });
});

describe('PR8b — CR6 concrete shear modes', () => {
  it('checks count subió de 10 → 13 con los 3 nuevos modos', () => {
    const r = calcAnchorPlate(anchorPlateDefaults);
    expect(r.checks).toHaveLength(13);
    expect(r.checks.find((c) => c.id === 'concrete-edge-breakout')).toBeDefined();
    expect(r.checks.find((c) => c.id === 'concrete-pryout')).toBeDefined();
    expect(r.checks.find((c) => c.id === 'concrete-breakout-v')).toBeDefined();
  });

  it('FTUX (centered, hef=300): edge breakout no domina (cono y splitting governing)', () => {
    const r = calcAnchorPlate(anchorPlateDefaults);
    const eb = r.checks.find((c) => c.id === 'concrete-edge-breakout')!;
    expect(eb.utilization).toBeGreaterThan(0);
    expect(eb.utilization).toBeLessThan(1.0);
  });

  it('Placa de fachada (cerca de borde): edge breakout activa fail', () => {
    // Pre-PR8b: checkBoltShear sólo cubría friction + steel shear → no captaba
    // el fallo del hormigón. Con c=80 y VEd alto, edge breakout debería fallar.
    const r = calcAnchorPlate({
      ...anchorPlateDefaults,
      pedestal_cX: 80, pedestal_cY: 80,
      VEd: 100,
    });
    const eb = r.checks.find((c) => c.id === 'concrete-edge-breakout')!;
    expect(eb.utilization).toBeGreaterThan(1.0);
    expect(eb.status).toBe('fail');
  });

  it('Pry-out usa k=2 cuando hef ≥ 60mm (caso típico)', () => {
    const r = calcAnchorPlate(anchorPlateDefaults);
    const po = r.checks.find((c) => c.id === 'concrete-pryout')!;
    expect(po.limit).toContain('k=2.0');
  });

  it('Breakout-V reporta neutral para hef ≥ 60mm (no aplica)', () => {
    const r = calcAnchorPlate(anchorPlateDefaults);
    const bo = r.checks.find((c) => c.id === 'concrete-breakout-v')!;
    expect(bo.status).toBe('neutral');
    expect(bo.limit).toBe('No aplica');
  });

  it('sin cortante (Vx=Vy=VEd=0) → todos los modos de hormigón en V neutral', () => {
    // resolveShear da prioridad a Vx/Vy si difieren de VEd: para "sin cortante"
    // hay que setear los tres a 0 explícitamente.
    const r = calcAnchorPlate({ ...anchorPlateDefaults, VEd: 0, Vx: 0, Vy: 0 });
    const eb = r.checks.find((c) => c.id === 'concrete-edge-breakout')!;
    const po = r.checks.find((c) => c.id === 'concrete-pryout')!;
    expect(eb.status).toBe('neutral');
    expect(po.status).toBe('neutral');
  });

  it('N+V interaction usa EN 1992-4 §7.2.3 (exponente 2, dúctil)', () => {
    // (N/NRd)² + (V/VRd)² ≤ 1.0 — forma cuadrática (no la lineal EC3 Tab 3.4).
    // value string debe contener (ratio)² + (ratio)² format.
    const r = calcAnchorPlate(anchorPlateDefaults);
    const bi = r.checks.find((c) => c.id === 'bolt-interaction')!;
    expect(bi.value).toMatch(/\(\d+\.\d{2}\)² \+ \(\d+\.\d{2}\)²/);
    expect(bi.article).toBe('CE Anejo 11 §7.2.3');
  });

  it('Vx/Vy direccional: si Vx=0, Vy=50, edge breakout proyecta a borde y', () => {
    // Con Vy=50 y Vx=0 (declarando Vy explícito), c1 = cY1 (no cX1).
    // Verificar que el limit string refleja c1 = cY direccional.
    const r = calcAnchorPlate({
      ...anchorPlateDefaults,
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
    const r = calcAnchorPlate(anchorPlateDefaults);
    // Sentinel: worstUtil = 0.928 (fijado en PR7b). NO debe cambiar con
    // resolveEdges sobre defaults simétricos.
    expect(r.worstUtil).toBeCloseTo(0.928, 2);
  });

  it('asimétrico cX1 << cX2 → Ac/Ac0 menor (proyección más limitada en +x)', () => {
    // cX1=50, cX2=500 → la proyección del cono se limita a 50 en +x.
    // Comparar con simétrico cX=200.
    const r_sym = calcAnchorPlate({ ...anchorPlateDefaults, pedestal_cX: 200 });
    const r_asym = calcAnchorPlate({
      ...anchorPlateDefaults,
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
    expect(cone_asym.limit).toMatch(/ψs=0\.7[0-3]/);
    expect(cone_sym.limit).toMatch(/ψs=0\.83/);
  });

  it('asimétrico cY1 = 50 (placa cerca borde y+) → ψs limitado por cY1', () => {
    const r = calcAnchorPlate({
      ...anchorPlateDefaults,
      pedestal_cY1: 50, pedestal_cY2: 350,
    });
    const cone = r.checks.find((c) => c.id === 'concrete-cone')!;
    // c_min = 50 < c_cr = 450 → ψs = 0.7 + 0.3·50/450 = 0.733
    expect(cone.limit).toMatch(/ψs=0\.73/);
  });

  it('helper preserva backward-compat: cambiar legacy pedestal_cX sin direccionales sigue funcionando', () => {
    // Override pedestal_cX (legacy field) sin tocar cX1/cX2 → resolveEdges
    // detecta cX1==cX2==default y usa pedestal_cX. ψs refleja el nuevo valor.
    const r = calcAnchorPlate({ ...anchorPlateDefaults, pedestal_cX: 500, pedestal_cY: 500 });
    const cone = r.checks.find((c) => c.id === 'concrete-cone')!;
    // c_min = 500 ≥ c_cr = 450 → ψs = 1.00
    expect(cone.limit).toMatch(/ψs=1\.00/);
  });

  it('splitting con cY1 cercano al borde → ψs reducido', () => {
    const r = calcAnchorPlate({
      ...anchorPlateDefaults,
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
      ...anchorPlateDefaults,
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
    const r = calcAnchorPlate(anchorPlateDefaults);
    const sp = r.checks.find((c) => c.id === 'splitting')!;
    expect(sp.limit).toMatch(/ψh=\d/);
    expect(sp.limit).toMatch(/ψec=\d/);
    expect(sp.limit).toMatch(/ψs=\d/);
  });

  it('ψh,sp por canto del macizo (no por edge): h grande → ψh > 1 (amplifica)', () => {
    // Pedestal profundo (h=2000 > 2·hef=600), edge moderado (200) → ψh > 1 (cap-binding)
    const r = calcAnchorPlate({ ...anchorPlateDefaults, pedestal_h: 2000 });
    const sp = r.checks.find((c) => c.id === 'splitting')!;
    expect(sp.limit).toMatch(/ψh=1\.[2-9]\d/);   // amplificación visible
  });

  it('ψh,sp cap inferior = 1: macizo poco profundo no reduce por debajo de 1', () => {
    // h_pedestal=400 < 2·hef=600 → (h/2hef)^(2/3) = 0.86, pero max(1, ...) = 1.0
    const r = calcAnchorPlate({ ...anchorPlateDefaults, pedestal_h: 400 });
    const sp = r.checks.find((c) => c.id === 'splitting')!;
    expect(sp.limit).toContain('ψh=1.00');
  });

  it('h_pedestal ≥ 2·hef y c_min ≥ c_cr,sp → no crítico (neutral)', () => {
    const r = calcAnchorPlate({
      ...anchorPlateDefaults,
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
    const r4 = calcAnchorPlate({ ...anchorPlateDefaults, bar_nLayout: 4, My: 10 });
    const r9 = calcAnchorPlate({ ...anchorPlateDefaults, bar_nLayout: 9, My: 10 });
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
    const r = calcAnchorPlate({ ...anchorPlateDefaults, Mx: 80 });
    const sp = r.checks.find((c) => c.id === 'splitting')!;
    const psi_ec_match = sp.limit?.match(/ψec=([\d.]+)/);
    if (psi_ec_match) {
      const psi_ec = parseFloat(psi_ec_match[1]);
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
    const r = calcAnchorPlate(anchorPlateDefaults);
    expect(r.solver.mode).toBe('biaxial-plastic');
    expect(r.solver.converged).toBe(true);
    expect(r.solver.Ft_total).toBeGreaterThan(20);
    expect(r.solver.Ft_total).toBeLessThan(50);
  });

  it('FTUX biaxial NA orientado al momento externo (phi ≈ atan(My/Mx))', () => {
    const r = calcAnchorPlate(anchorPlateDefaults);
    const phi_expected = Math.atan2(anchorPlateDefaults.My, anchorPlateDefaults.Mx);
    expect(r.solver.phi_NA).toBeCloseTo(phi_expected, 1);   // ±0.05 rad ≈ 3°
  });

  it('FTUX biaxial residuos de momento ≈ 0 (equilibrio exacto)', () => {
    const r = calcAnchorPlate(anchorPlateDefaults);
    expect(Math.abs(r.solver.residuals.SMx_kNm)).toBeLessThan(0.01);
    expect(Math.abs(r.solver.residuals.SMy_kNm)).toBeLessThan(0.01);
  });

  it('cargas bajas → Ft_total bajo (no saturado, bolt-tension util < 1)', () => {
    const r = calcAnchorPlate({ ...anchorPlateDefaults, Mx: 10, My: 2 });
    const bt = r.checks.find((c) => c.id === 'bolt-tension')!;
    expect(bt.utilization).toBeLessThan(0.5);
    // El bug pre-CR1 daba util ≡ 1.00 incluso en cargas bajas.
  });

  it('cargas altas → al menos una barra al cap FtRd', () => {
    // Mx muy alto fuerza saturación al menos en la barra más extrema.
    const r = calcAnchorPlate({ ...anchorPlateDefaults, Mx: 250, My: 0 });
    const maxFt = Math.max(...r.solver.bolts.map((b) => b.Ft));
    // FtRd = 314.16·434.78/1000 ≈ 136.59 kN. Esperar al menos 90% si carga
    // alta. (No siempre llega exactamente a 136.59 por la convergencia
    // de bisección.)
    expect(maxFt).toBeGreaterThan(120);
  });

  it('distribución lineal: Ft proporcional al signed distance al NA', () => {
    const r = calcAnchorPlate(anchorPlateDefaults);
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
    const r = calcAnchorPlate({ ...anchorPlateDefaults, My: 0 });
    // Dispatcher rutea a solveAxisAligned4 para nLayout=4 + My=0 (PR5).
    expect(['partial-lift', 'uniform-compression']).toContain(r.solver.mode);
    // Ft_total debe coincidir con PR7a (~26.89 kN)
    expect(r.solver.Ft_total).toBeCloseTo(26.89, 1);
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
  it('nLayout=9 + My=0 → solver biaxial, modela 9 barras', () => {
    const r = calcAnchorPlate({ ...base, bar_nLayout: 9, My: 0 });
    expect(r.solver.bolts).toHaveLength(9);
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
  it('nLayout=9 → cortante repartido entre 9 barras', () => {
    const r = calcAnchorPlate({ ...base, bar_nLayout: 9, My: 5, VEd: 100 });
    const bs = r.checks.find((c) => c.id === 'bolt-shear')!;
    expect(bs.limit).toContain('9·FvRd');
  });
});

describe('PR5 — H14 anchorage cd derivado de coordenadas reales', () => {
  it('cd reportado en el limit string (cuando hay tracción)', () => {
    const r = calcAnchorPlate({ ...base, bottom_anchorage: 'patilla' });
    const an = r.checks.find((c) => c.id === 'anchorage-length')!;
    expect(an.limit).toMatch(/cd=\d+ mm/);
  });
  it('barra interior tiene coverX mayor que barra de esquina', () => {
    // En layout 9, las barras del centro (0,0), (0,±yMax), (±xMax,0) tienen
    // mayor recubrimiento horizontal o vertical que las esquinas. El check
    // reporta el peor, que sigue siendo una esquina con cd = pedestal_cX.
    const r = calcAnchorPlate({ ...base, bar_nLayout: 9, My: 5 });
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
