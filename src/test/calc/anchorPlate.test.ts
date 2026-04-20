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
  // defaults: NEd=200, Mx=45 → e = 225 mm > a/6 (66.7).
  // Closed form (geométrica, no capada por FtRd):
  //   x_t = a/2 - edge_x        = 200 - 50         = 150 mm
  //   x_n = a/2 - edge_x/3      = 200 - 50/3       ≈ 183.33 mm
  //   x_c = x_t + x_n           ≈ 333.33 mm
  //   M_kNmm = 45 · 1000 = 45000
  //   Ft_total = (45000 − 200·183.33) / 333.33 ≈ 25.0 kN
  //   Nc = 200 + 25 = 225 kN
  const sol = solveAxisAligned4(base);

  it('mode = partial-lift', () => expect(sol.mode).toBe('partial-lift'));
  it('two bars in tension', () => expect(sol.n_t).toBe(2));
  it('Ft_total matches closed form (~25 kN)', () => {
    expect(sol.Ft_total).toBeCloseTo(25.0, 1);
  });
  it('Nc = NEd + Ft_total', () => {
    expect(sol.Nc).toBeCloseTo(225.0, 1);
  });
  it('lifted flag is true', () => expect(sol.lifted).toBe(true));
  it('Ft distributed equally across tensioned corner pair', () => {
    const tensioned = sol.bolts.filter((b) => b.inTension);
    expect(tensioned).toHaveLength(2);
    for (const b of tensioned) expect(b.Ft).toBeCloseTo(12.5, 1);
  });
});

describe('anchor plate — result shape', () => {
  const r = calcAnchorPlate(base);

  it('valid case returns 10 checks', () => {
    expect(r.checks).toHaveLength(10);
  });
  it('all checks carry a real id and article', () => {
    const expectedIds = [
      'plate-compression', 'plate-bending', 'bolt-tension', 'bolt-shear',
      'bolt-interaction', 'anchorage-length', 'concrete-cone', 'pullout',
      'splitting', 'stiffener',
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
  it('separación entre barras apretada baja cd y anula la reducción', () => {
    // bar_spacing_x=70 → (70-20)/2=25 gobierna cd=25 < 60 → α1=1.0.
    const r = calcAnchorPlate({ ...base, bottom_anchorage: 'patilla', bar_spacing_x: 70 });
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
  it('arandela_tuerca → NRd,p = 6·Ah·fck/γMp computed', () => {
    // φ20 + OD 50: Ah = (50² - 20²)·π/4 = 2100·π/4 ≈ 1649.3 mm²
    // NRd,p = 6·1649.3·25/1.4/1000 ≈ 176.7 kN
    const r = calcAnchorPlate({
      ...base,
      bottom_anchorage: 'arandela_tuerca',
      washer_od: 50,
      NEd: 100, NEd_G: 50, Mx: 40, My: 0,
    });
    const po = r.checks.find((c) => c.id === 'pullout')!;
    expect(po.limit).toContain('NRd,p=176.7');
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

// ─── CYPE-MET oracle placeholders ────────────────────────────────────────
// TODO(PR-4): once manual CYPE-MET runs are captured for these configs,
// replace `it.skip` with real assertions (±5 % tolerance on Nc, Ft_total,
// NRd,c, NRd,p, worstUtil). Target reference: CYPE Ingenieros Metal 3D
// "Placa base en metal" module, same geometry + same partial factors.
describe.skip('anchor plate — CYPE-MET oracle cross-check (PR-4)', () => {
  it('FTUX default vs CYPE-MET: worstUtil within ±5 %', () => { /* TODO */ });
  it('pure compression vs CYPE-MET: Nc within ±1 %', () => { /* TODO */ });
  it('biaxial 6-bar vs CYPE-MET: Ft_total within ±5 %', () => { /* TODO */ });
  it('edge-near splitting vs CYPE-MET: NRd,sp within ±10 %', () => { /* TODO */ });
  it('patilla anchorage length vs CYPE-MET: lb,rqd within ±5 %', () => { /* TODO */ });
});
